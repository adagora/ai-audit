// Constructed fragment sketch only. It deliberately does not define JavaScript RegExp.
module MINI-JAVASCRIPT
  imports INT
  syntax Exp ::= String | redact(Exp)
  syntax KItem ::= "result"
  configuration <k> $PGM:Exp </k>
endmodule
