# Gramática de PBDMM

> Versión 2.0. Notación EBNF: `x*` = cero o más veces, `x+` = una o más veces, `[x]` = opcional, `a | b` = uno de los
> dos, `"x"` = el texto tal cual. Sale de `parsear()` en [`app/pbdmm.js`](../../app/pbdmm.js).

## Tokens

```ebnf
NOMBRE   = LETRA (LETRA | DIGITO)* ;                    (* que no sea una palabra reservada *)
LETRA    = "A".."Z" | "a".."z" | "_" | "á" | "é" | "í" | "ó" | "ú" | "ñ" | "Á" | "É" | "Í" | "Ó" | "Ú" | "Ñ" ;
DIGITO   = "0".."9" ;
NUMERO   = ( DIGITO (DIGITO | "_")* ["." DIGITO*] | "." DIGITO+ ) [("e" | "E") ["+" | "-"] DIGITO+] ;
TEXTO    = '"' CAR* '"' | "'" CAR* "'" ;                 (* en una sola línea; escapes \n \t \x *)
FTEXTO   = ("f" | "F") TEXTO ;                          (* con { expresion [":" FORMATO] } adentro *)
FORMATO  = ["."] DIGITO* ["f" | "%"] ;
NL       = fin de línea (fuera de ( [ { ) ;
INDENT   = la línea tiene más sangría que la de arriba ;
DEDENT   = la línea vuelve a una sangría anterior ;
COMENTARIO = "#" hasta el fin de la línea ;             (* se ignora *)
```

Palabras reservadas: `def return if elif else for in and or not is True False None global pass break continue`
(y, solo para dar un buen error, `while import from class lambda`).

## Programa y sentencias

```ebnf
programa     = (NL | sentencia)* EOF ;

sentencia    = def | if | for | simple fin_linea ;
fin_linea    = NL | EOF ;                                (* o antes de un DEDENT *)

bloque       = ":" ( simple fin_linea                    (* if x: y  en la misma línea *)
                   | NL INDENT (NL | sentencia)+ DEDENT ) ;

def          = "def" NOMBRE "(" [parametros] ")" bloque ;
parametros   = parametro ("," parametro)* [","] ;
parametro    = NOMBRE ["=" expresion] ;                  (* los que tienen "=" van al final *)

if           = "if" expresion bloque ("elif" expresion bloque)* ["else" bloque] ;
for          = "for" nombres "in" expresion bloque ;
nombres      = NOMBRE ("," NOMBRE)* ;

simple       = "pass" | "break" | "continue"
             | "return" [tupla]
             | "global" NOMBRE ("," NOMBRE)*
             | tupla [op_asig tupla] ;                   (* expresión sola o asignación *)
op_asig      = "=" | "+=" | "-=" | "*=" | "/=" | "//=" | "**=" ;
tupla        = expresion ("," expresion)* [","] ;         (* con coma = una lista *)
```

A la izquierda de una asignación solo puede ir un `NOMBRE`, un `x[i]`, un `x.nombre` o (solo con `=`) varios de esos
separados por comas.

## Expresiones

```ebnf
expresion    = o_logico ["if" o_logico "else" expresion] ;
o_logico     = y_logico ("or" y_logico)* ;
y_logico     = no_logico ("and" no_logico)* ;
no_logico    = "not" no_logico | comparacion ;
comparacion  = suma (op_comp suma)* ;                     (* encadenadas: a < b < c *)
op_comp      = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "not" "in" | "is" | "is" "not" ;
suma         = producto (("+" | "-") producto)* ;
producto     = unario (("*" | "/" | "//" | "%") unario)* ;
unario       = ("-" | "+") unario | potencia ;
potencia     = postfijo ["**" unario] ;                   (* de derecha a izquierda *)
postfijo     = atomo ( "(" [argumentos] ")" | "." NOMBRE | "[" expresion "]" | "[" [expresion] ":" [expresion] "]" )* ;
                                                         (* x[i] · rebanada x[a:b] *)
argumentos   = argumento ("," argumento)* [","] ;
argumento    = expresion | "*" expresion | NOMBRE "=" expresion | "**" expresion ;
                                                         (* los con nombre van después de los posicionales *)
atomo        = NUMERO | TEXTO+ | FTEXTO | NOMBRE | "True" | "False" | "None"
             | "(" [tupla] ")"
             | "[" [expresion ("," expresion)* [","]] "]"
             | "[" expresion "for" nombres "in" o_logico ["if" o_logico] "]"
             | "{" [par ("," par)* [","]] "}" ;
par          = expresion ":" expresion ;
```
