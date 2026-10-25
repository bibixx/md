Python:

```python
from dataclasses import dataclass

@dataclass
class User:
    name: str
    age: int = 0  # default

    def greet(self) -> str:
        return f"hi {self.name}, you are {self.age}"
```

TypeScript:

```ts
interface Props { title: string; count?: number }

export function render({ title, count = 1 }: Props): string {
  const items = Array.from({ length: count }, (_, i) => `${title} #${i}`);
  return items.join("\n");
}
```

Shell:

```bash
for f in *.md; do
  echo "rendering $f" && md -p "$f" > "${f%.md}.txt"
done
```

JSON:

```json
{ "padding": { "top": 1, "left": 2 }, "enabled": true, "count": 3, "name": null }
```

Diff:

```diff
- const width = cols - 4;
+ const width = cols - left - right;
```

No language:

```
plain fenced block
  with indentation
```

Unknown language:

```weirdlang
this has no highlighter
```

Indented code block:

    indented with four spaces
    second line

A very long line that has to wrap:

```js
const message = "this line is deliberately much longer than any normal terminal is wide so we can see how a long line of code wraps";
```

Tabs:

```go
func main() {
	fmt.Println("tab indented")
}
```
