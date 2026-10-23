/** Wraps SVG body markup in a document with a background rect. Used by the vector modes. */
export function svgDocument(width: number, height: number, background: string, body: string) {
  const w = Math.round(width);
  const h = Math.round(height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="100%" height="100%" fill="${background}"/>
${body}
</svg>
`;
}
