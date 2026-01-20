export const WITTY_LOADING_PHRASES = [
  'knocking on device doors...',
  'tapping on screens...',
  'lighting up notifications...',
  'sending smoke signals...',
  'launching message bottles...',
  'dispatching digital pigeons...',
  'releasing notification doves...',
  'warming up the push engine...',
  'revving notification motors...',
  'spinning up delivery wheels...',
  'tuning notification frequencies...',
  'conducting the push symphony...',
  'orchestrating deliveries...',
  'brewing notification potions...',
  'cooking up alerts...',
  'baking fresh messages...',
  'crafting digital postcards...',
  'building notification bridges...',
  'paving digital pathways...',
  'opening communication portals...',
  'channeling message energy...',
  'summoning engagement spirits...',
  'casting delivery spells...',
  'charging push capacitors...',
  'powering up channels...',
  'igniting notification sparks...',
  'fanning engagement flames...',
  'planting message seeds...',
  'watering notification gardens...',
  'polishing delivery pipelines...',
  'waxing the broadcast waves...',
  'stretching delivery muscles...',
  'flexing notification bandwidth...',
  'calibrating reach sensors...',
  'adjusting engagement dials...',
  'threading message needles...',
  'weaving notification tapestries...',
  'painting engagement pictures...',
];

let lastPhraseIndex = -1;

export function getRandomPhrase(): string {
  // Avoid repeating the same phrase twice in a row
  let index: number;
  do {
    index = Math.floor(Math.random() * WITTY_LOADING_PHRASES.length);
  } while (index === lastPhraseIndex && WITTY_LOADING_PHRASES.length > 1);

  lastPhraseIndex = index;
  return WITTY_LOADING_PHRASES[index];
}
