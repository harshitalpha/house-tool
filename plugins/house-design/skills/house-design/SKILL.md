---
name: house-design
description: Design or edit a 3D house, flat or room layout (rooms, doors, windows, furniture, lights, paint, flooring, textures) using the house MCP tools. Use when the user wants to plan, furnish, restyle or fix a floor plan.
---

# House design

You edit a real floor plan through the `house` MCP tools. The house lives in one JSON file (`house.json` in the working directory, or `$HOUSE_FILE`). Every change is a validated operation, so you never edit the JSON by hand.

## Tools

| Tool | Use |
|---|---|
| `house_guide` | Format, coordinate conventions and every operation with an example. **Call it once before your first edit.** |
| `house_new` | Start from `blank`, or a template (`studio`, `twoBhk`, `openPlan`, `sampleFlat`). |
| `house_get` | Compact text view with all ids, sizes, positions, openings and lights. Use it to find ids and free space. |
| `house_apply_ops` | Apply a batch of operations. Atomic: all or nothing. Supports `dry_run`. |
| `house_validate` | Check for overlaps, furniture outside rooms, openings that do not fit. |
| `house_undo` | Undo the last batch. |

## Workflow

1. `house_guide`, then `house_get` (or `house_new` if there is no house).
2. Plan in your head first: room sizes, where each door is, which wall each piece sits against, which way it faces. Real sizes: queen bed 1.6 x 2.0 m, king 1.9 x 2.0 m, 3-seat sofa 2.0 x 0.9 m, dining table for 6 1.6 x 0.9 m, wardrobe 1.8 x 0.6 m, 55-inch TV 1.23 m wide, door 0.9 m, walkway at least 0.6 m.
3. Send 5 to 15 related operations per `house_apply_ops` call (a room and its furniture, one wall treatment). Use ids returned in the messages for follow-ups. A failed batch changes nothing: read the error, fix, resend.
4. `house_get` after each batch and check positions against the plan: nothing in front of a door, nothing blocking a window, headboards on a wall, chairs facing their table.
5. Finish with `house_validate`, then tell the user what you built and which sizes were your assumptions.

## Rules that save retries

- Units are metres. North is -Z, east is +X. Rotation is degrees clockwise seen from above; at 0 an item faces south. To face west use 90, north 180, east 270.
- `against: "<wall>"` places furniture flush to a wall and faces it into the room. Prefer it over hand-computed coordinates.
- Furniture must be fully inside its room. Leave 1 cm of margin from walls when giving x/z yourself (positions round to 2 decimals).
- Neighbouring rooms are exactly one wall thickness (0.15 m) apart. Use `placeNextTo` in `add_room`.
- A door cuts through the neighbour's wall too: define each doorway once, on one room.
- Use realistic paint colours (hex). Use `set_finish` for wood, tiles, fabric, photo wallpaper; a wall's `finish.color` overrides its `material`, so when repainting a finished wall also set the finish colour.
- Anything that is not a built-in model (`sofa`, `armchair`, `bed`, `dining_table`, `coffee_table`, `chair`, `tv_unit`, `wardrobe`, `bookshelf`, `rug`, `floor_lamp`, `plant`) is built from `parts` (boxes, cylinders, spheres, lathe, ...). Keep parts inside the item's width, depth and height.
- Items with `locked: true` must not be moved, resized or removed. Ask the user to unlock them.
- Before removing a room or replacing the house (`house_new`), confirm with the user. Undo exists, but it is only 50 steps deep.
- If a request is ambiguous, ask a short question instead of guessing. If you made an assumption (a size, a position), say so.

## Seeing the result

The user can watch live: from the repo run `HOUSE_FILE=/path/to/house.json npm run dev -w @house/web` and open http://localhost:5173. The page reloads whenever you change the file and writes the user's own edits back, so call `house_get` again if they say they moved something.
