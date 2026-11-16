const nameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function sortAlphabetically(items, getLabel = (item) => item) {
  return [...items].sort((left, right) => (
    nameCollator.compare(String(getLabel(left) ?? ""), String(getLabel(right) ?? ""))
  ));
}
