import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
from citywheels.fake_model import FakeModel

request = json.load(sys.stdin)
names = {call['id']: call['function']['name'] for message in request['messages'] for call in message.get('tool_calls', [])}
messages = [{**message, **({'name': names.get(message.get('tool_call_id'))} if message.get('role') == 'tool' else {})} for message in request['messages']]
turn = FakeModel().complete(messages, [])
calls = [{'id': call.id, 'type': 'function', 'function': {'name': call.name, 'arguments': json.dumps(call.arguments)}} for call in turn.tool_calls]
message = {'role': 'assistant', 'content': turn.content, **({'tool_calls': calls} if calls else {})}
print(json.dumps({'id': 'python-scripted', 'object': 'chat.completion', 'choices': [{'index': 0, 'message': message, 'finish_reason': 'tool_calls' if calls else 'stop'}]}))
