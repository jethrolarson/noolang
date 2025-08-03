# query tools

## query

- `noo --query "foo" examples/demo.noo`
- search file for symbols like query and includes search results

## at

- `noo --at "44:20" examples/demo.noo`
- target code at code position `"[line_number]:[column_number]"`

# view tools

All these view tools can be combined with query tools

## view

- `noo --at "44:20" --view examples/demo.noo`
- default if any query tool is used

## explode

- `noo --at "2:20" --explode examples/demo.noo`
- If target is a definition recurrsively inline it and print including file,location, type info of all inlined expressions

## type-ast

- `noo --at "2:20" --type-ast examples/demo.noo`
- print the type ast of the target. Essentially what typeAndDecorate returns

## Run-to line number

- `noo --run-to 44 examples/demo.noo`
- cli command to execute the file to the specified line and print the expression at that line
