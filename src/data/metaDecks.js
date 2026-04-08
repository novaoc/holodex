// Popular Standard format meta decks (2025-2026 season)
// Cards are resolved by name + set at import time, picking the regular (cheapest) printing
// Each deck has the core cards — trainers vary by player preference

export const metaDecks = [
  {
    name: 'Charizard ex / Pidgeot',
    archetype: 'Charizard ex',
    description: 'The king of consistency. Charizard ex powers up from Rare Candy and OHKOs most things. Pidgeot ex tutors any card.',
    cards: [
      { name: 'Charizard ex', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 3 },
      { name: 'Charmander', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 4 },
      { name: 'Charmeleon', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 1 },
      { name: 'Pidgey', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 4 },
      { name: 'Pidgeotto', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 1 },
      { name: 'Pidgeot ex', setCode: 'sv3', setName: 'Obsidian Flames', quantity: 2 },
      { name: 'Rotom V', setCode: 'sv4', setName: 'Paradox Rift', quantity: 1 },
      { name: 'Lumineon V', setCode: 'sv3pt5', setName: '151', quantity: 1 },
    ]
  },
  {
    name: 'Gardevoir ex',
    archetype: 'Gardevoir ex',
    description: 'Psychic acceleration engine. Kirlia draws cards. Gardevoir ex powers up attackers with Shining Arcana.',
    cards: [
      { name: 'Gardevoir ex', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 3 },
      { name: 'Kirlia', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 4 },
      { name: 'Ralts', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 4 },
      { name: 'Mew ex', setCode: 'sv2', setName: 'Paldea Evolved', quantity: 1 },
      { name: 'Iron Valiant ex', setCode: 'sv4', setName: 'Paradox Rift', quantity: 2 },
    ]
  },
  {
    name: 'Lost Zone Box',
    archetype: 'Lost Zone',
    description: 'Lost Zone engine with Comfey and Colress. Uses Cramorant and Sableye as attackers. Toolbox approach.',
    cards: [
      { name: 'Comfey', setCode: 'swsh12', setName: 'Crown Zenith', quantity: 4 },
      { name: 'Cramorant', setCode: 'swsh12', setName: 'Crown Zenith', quantity: 2 },
      { name: 'Sableye', setCode: 'swsh12', setName: 'Crown Zenith', quantity: 2 },
      { name: 'Radiant Greninja', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 1 },
      { name: 'Manaphy', setCode: 'sv3pt5', setName: '151', quantity: 1 },
    ]
  },
  {
    name: 'Miraidon ex / Flaaffy',
    archetype: 'Miraidon ex',
    description: 'Electric acceleration with Flaaffy. Miraidon ex searches for Electric Pokémon. Fast and aggressive.',
    cards: [
      { name: 'Miraidon ex', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 3 },
      { name: 'Flaaffy', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 3 },
      { name: 'Mareep', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 4 },
      { name: 'Regieleki VMAX', setCode: 'sv1', setName: 'Scarlet & Violet', quantity: 2 },
      { name: 'Raikou V', setCode: 'sv2', setName: 'Paldea Evolved', quantity: 1 },
    ]
  },
  {
    name: 'Chien-Pao ex / Baxcalibur',
    archetype: 'Chien-Pao ex',
    description: 'Water energy acceleration with Baxcalibur. Chien-Pao ex discards energy for massive damage.',
    cards: [
      { name: 'Chien-Pao ex', setCode: 'sv2', setName: 'Paldea Evolved', quantity: 3 },
      { name: 'Baxcalibur', setCode: 'sv2', setName: 'Paldea Evolved', quantity: 2 },
      { name: 'Arctibax', setCode: 'sv2', setName: 'Paldea Evolved', quantity: 1 },
      { name: 'Frigibax', setCode: 'sv2', setName: 'Paldea Evolved', quantity: 4 },
      { name: 'Manaphy', setCode: 'sv3pt5', setName: '151', quantity: 1 },
    ]
  },
  {
    name: 'Giratina VSTAR / Lost Zone',
    archetype: 'Giratina VSTAR',
    description: 'Giratina VSTAR uses Star Requiem for instant KO when Lost Zone has 10+ cards. Lost Zone engine provides draw and setup.',
    cards: [
      { name: 'Giratina VSTAR', setCode: 'swsh11', setName: 'Lost Origin', quantity: 3 },
      { name: 'Giratina V', setCode: 'swsh11', setName: 'Lost Origin', quantity: 3 },
      { name: 'Comfey', setCode: 'swsh12', setName: 'Crown Zenith', quantity: 4 },
      { name: 'Cramorant', setCode: 'swsh12', setName: 'Crown Zenith', quantity: 2 },
      { name: 'Sableye', setCode: 'swsh12', setName: 'Crown Zenith', quantity: 1 },
    ]
  },
]
