/**
 * The units offered as suggestions wherever an ingredient's unit is typed.
 *
 * A suggestion, not a list to choose from: anything counted can be its own
 * unit ("tortilla", "hot dog"), and the page pluralises whatever it is given.
 * These are the ones that come up most, plus the convertible ones — see
 * `unitChoices` in `lib/meals/quantity.ts`.
 */
export const COMMON_UNITS = [
  "cup",
  "tbsp",
  "tsp",
  "lb",
  "oz",
  "each",
  "egg",
  "slice",
  "can",
  "jar",
  "packet",
  "clove",
  "bunch",
  "cup dry",
] as const;

export function UnitSuggestions() {
  return (
    <datalist id="meal-units">
      {COMMON_UNITS.map((unit) => (
        <option key={unit} value={unit} />
      ))}
    </datalist>
  );
}
