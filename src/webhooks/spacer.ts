// A 1000x1 fully-transparent PNG. Served at /spacer.png and used as an embed
// image so Discord renders the embed at a consistent full width (embeds
// otherwise shrink to fit their content).
const SPACER_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAA+gAAAABCAYAAABNAIQzAAAAG0lEQVR42u3BMQEAAADCoPVPbQwfoAAAAIC7AQ+hAAEipZISAAAAAElFTkSuQmCC';

export const SPACER_PNG = Buffer.from(SPACER_BASE64, 'base64');
