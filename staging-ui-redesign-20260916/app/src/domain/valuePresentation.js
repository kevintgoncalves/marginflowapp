export function displayValueForDataAvailability(value, hasData, format) {
  return hasData ? format(value) : "–";
}
