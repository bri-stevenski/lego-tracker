---
type: business_term
domain: core
---

# LegoItemType

The `LegoItemType` represents the domain classification of a LEGO catalogue item. It is used throughout the application for filtering, API payloads, and validation.

## Values

- `'set'`: A full commercial product set (e.g., Star Wars AT-AT).
- `'minifig'`: An individual figure, often sold separately or found within sets.
- `'part'`: A single element — one mould in one colour, catalogued by LEGO element id rather than a set number. Produced by a Pick-a-Brick CSV import.

## Usage

Used in search queries and response mapping to distinguish between different types of catalog entries.

```typescript
type LegoItemType = 'set' | 'minifig' | 'part'
```

Example validation:

```typescript
if (item.type === 'set') {
  // calculate set-specific rules
}
```
