"""Execute the original CityWheels loop and retain its evaluation evidence."""
import hashlib
from contextlib import nullcontext
import json
import math
import os
from pathlib import Path
import shutil
import sys
import tempfile
import urllib.request
from datetime import datetime

root = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(root))
from citywheels.agent import run_agent
from citywheels.fake_model import FakeModel
import citywheels.agent as agent_module

def emit(event):
    if '--events' in sys.argv:
        event['at'] = datetime.now().astimezone().isoformat()
        print('CITYWHEELS_EVENT ' + json.dumps(event), file=sys.stderr, flush=True)

class ObservedModel:
    def __init__(self, wrapped):
        self.wrapped = wrapped
        self.turn = 0
        self.initial_input_hash = None
        self.tool_contract_hash = None

    def complete(self, messages, tools):
        self.turn += 1
        if self.turn == 1:
            self.initial_input_hash = hashlib.sha256(json.dumps({'messages': messages, 'tools': tools}, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
            self.tool_contract_hash = hashlib.sha256(json.dumps(tools, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
        emit({'type': 'model-start', 'turn': self.turn})
        result = self.wrapped.complete(messages, tools)
        emit({'type': 'model-result', 'turn': self.turn, 'content': result.content, 'tools': [call.name for call in result.tool_calls]})
        return result

shared_rule = '--proxy-qdl' in sys.argv
integrated = shared_rule or '--proxy-native' in sys.argv

def shared_refund(arguments):
    args = json.loads(arguments) if isinstance(arguments, str) else arguments
    if not isinstance(args, dict) or set(args) != {'booking_id'}:
        raise ValueError('Shared rule requires only booking_id')
    request = urllib.request.Request(os.environ['CITYWHEELS_RULE_URL'] + '/refund', data=json.dumps(args).encode(), headers={'Authorization': 'Bearer ' + os.environ['CITYWHEELS_CLIENT_KEY'], 'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    if result.get('error'):
        raise RuntimeError('Shared refund rule unavailable')
    if not result.get('found'):
        return {'found': False, 'id': args['booking_id'], 'message': result.get('message'), 'refund_eur': None}
    booking = result['booking']
    return {'found': True, 'id': booking['id'], 'status': booking['status'], 'rental_price_eur': booking['rental_price_eur'], 'booking_fee_eur': booking['booking_fee_eur'],
            'booking_fee_refund_eur': 0, 'deposit_eur': booking['deposit_eur'], 'paid_with': booking['paid_with'], 'booking_fee_note': 'The booking fee is not refunded.',
            'can_cancel': not result['cannot_cancel'], 'band': 'not_cancellable' if result['cannot_cancel'] else '48h_or_more' if result['hours_before_start'] >= 48 else '24h_up_to_48h' if result['hours_before_start'] >= 24 else 'under_24h',
            'rental_refund_percent': result['refund_percent_of_rental'], 'rental_refund_eur': result['rental_refund_eur'], 'deposit_refund_eur': result['deposit_refund_eur'], 'refund_eur': result['total_refund_eur'],
            'channel': None if result['cannot_cancel'] else booking['paid_with'], 'channel_detail': result['how'], 'reason': result['note'], 'decision_id': result['decision_id']}

original_run_tool = agent_module.run_tool
def observed_tool(name, arguments, **kwargs):
    emit({'type': 'tool-start', 'name': name, 'arguments': arguments})
    result = shared_refund(arguments) if shared_rule and name == 'calculate_refund' else original_run_tool(name, arguments, **kwargs)
    emit({'type': 'tool-result', 'name': name, 'result': result})
    return result

agent_module.run_tool = observed_tool

live = '--live' in sys.argv[2:]
model_name = sys.argv[sys.argv.index('--model') + 1] if '--model' in sys.argv else 'gpt-4o-mini'
model = FakeModel()
if integrated:
    from citywheels.openai_model import OpenAIModel
    model_name = os.environ['CITYWHEELS_PROXY_MODEL']
    model = OpenAIModel(os.environ['CITYWHEELS_CLIENT_KEY'], os.environ['CITYWHEELS_PROXY_MODEL'], os.environ['CITYWHEELS_PROXY_URL'] + '/v1')
elif live:
    from citywheels.openai_model import OpenAIModel
    key = os.environ.get('OPENAI_API_KEY', '').strip()
    if not key:
        raise ValueError('Live mode requires OPENAI_API_KEY')
    model = OpenAIModel(key, model_name, 'https://api.openai.com/v1')

request = json.load(sys.stdin)
source = root / 'data'
original = (source / 'bookings.json').read_bytes()
evidence_root = Path(os.environ['CITYWHEELS_EVIDENCE_ROOT']) if os.environ.get('CITYWHEELS_EVIDENCE_ROOT') else Path(__file__).resolve().parents[1] / 'live' / 'evaluations'
evidence_root.mkdir(parents=True, exist_ok=True)
with nullcontext(tempfile.mkdtemp(prefix='python-', dir=evidence_root)) as folder:
    data = Path(folder) / 'data'
    shutil.copytree(source, data)
    patch = request.get('bookingPatch')
    if patch is not None:
        if set(patch) != {'id', 'rental_price_eur'}:
            raise ValueError('Only a fixture rental-price override is supported')
        value = patch['rental_price_eur']
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError('Fixture price must be finite and nonnegative')
        bookings = json.loads((data / 'bookings.json').read_text())
        found = [b for b in bookings if b['id'] == patch['id']]
        if len(found) != 1:
            raise ValueError('Fixture override must identify one existing booking')
        found[0]['rental_price_eur'] = value
        (data / 'bookings.json').write_text(json.dumps(bookings))
    policy_patch = request.get('policyPatch')
    if 'policyPatch' in request:
        if os.environ.get('CITYWHEELS_BOOKING_CONTEXT') or not isinstance(policy_patch, dict) or set(policy_patch) != {'file', 'text'} or policy_patch['file'] not in ('cancellations.md', 'faq.md', 'prices.md') or not isinstance(policy_patch['text'], str) or not policy_patch['text'].strip() or len(policy_patch['text'].encode()) > 64000:
            raise ValueError('Invalid isolated policy fixture override')
        (data / 'policies' / policy_patch['file']).write_text(policy_patch['text'])
    context_path = os.environ.get('CITYWHEELS_BOOKING_CONTEXT')
    operational_context = None
    if context_path:
        if patch is not None:
            raise ValueError('Operational snapshots do not accept fixture overrides')
        operational_context = json.loads(Path(context_path).read_text())
        if operational_context.get('source') != 'synthetic-citywheels-backend' or request.get('now') != operational_context.get('businessAt'):
            raise ValueError('Invalid operational snapshot')
        (data / 'bookings.json').write_text(json.dumps([operational_context['booking']]))
    policy_hash = hashlib.sha256()
    for document in sorted((data / 'policies').rglob('*')):
        if document.is_file():
            policy_hash.update(str(document.relative_to(data)).encode())
            policy_hash.update(b'\0')
            policy_hash.update(document.read_bytes())
    before = (data / 'bookings.json').read_bytes()
    now = datetime.fromisoformat(request['now']) if request.get('now') else None
    observed_model = ObservedModel(model)
    result = run_agent(request['question'], observed_model, data_dir=data, now=now)
    after = (data / 'bookings.json').read_bytes()
    refund = next((c['result'] for c in reversed(result.tool_trace) if c['name'] == 'calculate_refund'), None)
    retrieved = {}
    for call in result.tool_trace:
        if call['name'] == 'search_policies':
            for passage in call['result'].get('passages', []):
                key = passage['source'] + '#' + passage['heading']
                retrieved[key] = {'id': key, 'text': passage['text'], 'metadata': {'source': passage['source'], 'heading': passage['heading']}}
    observation = {
        'answer': result.answer,
        'toolCalls': result.tool_trace,
        'retrieved': list(retrieved.values()),
        'data': {
            'operationalContext': operational_context, 'provider': 'host-proxied' if integrated else 'openai' if live else 'fake', 'model': model_name if integrated or live else 'python-fake', 'execution': 'actual-python-agent',
            'answerLower': result.answer.lower(), 'refund': refund,
            'bookingsUnchanged': before == after and original == (source / 'bookings.json').read_bytes(),
            'bookingFixtureHash': hashlib.sha256(before).hexdigest(),
            'knowledgeFixtureHash': policy_hash.hexdigest(), 'initialModelInputHash': observed_model.initial_input_hash, 'toolContractHash': observed_model.tool_contract_hash,
            'clock': request.get('now') or '2026-06-10T09:00:00+02:00',
            'intentTelemetry': 'not-emitted-by-agent', 'modelTurns': observed_model.turn,
        },
    }
    observation['data']['originalRefund'] = refund
    if refund is not None:
        observation['data']['refund'] = {**refund, 'total_refund_eur': refund.get('refund_eur')}
    observation['data']['evidenceDirectory'] = folder
    evidence = Path(folder)
    (evidence / 'input.json').write_text(json.dumps(request, indent=2))
    (evidence / 'observation.json').write_text(json.dumps(observation, indent=2))
    (evidence / 'manifest.json').write_text(json.dumps({'schemaVersion': 1, 'implementation': 'python-helpdesk', 'provider': 'host-proxied' if integrated else 'openai' if live else 'fake', 'model': model_name if integrated or live else 'python-fake', 'status': 'completed', 'createdAt': datetime.now().astimezone().isoformat(), 'auditAvailable': False}, indent=2))
    print(json.dumps(observation, ensure_ascii=False))
