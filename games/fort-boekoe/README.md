# Fort Boekoe — De Belegering (1772)

Een first-person 3D-game over **Fort Boekoe**, de Marronvesting van **Boni** in
het Surinaamse moeras. Je ziet eerst hoe het fort eruitzag en hoe de Marrons er
leefden, en beleeft daarna de **belegering van 20 september 1772** vanuit de
ogen van een verdediger achter de palissade.

De wereld is volledig procedureel opgebouwd met [Three.js](https://threejs.org/)
— rieten hutten, een palissade van vijf meter, het kampvuur, de gele vlag met de
zwart-witte leeuw, en het moeras eromheen — geïnspireerd op de diorama's van het
fort en op historische bronnen.

## Spelen

Open `index.html` in een moderne browser. Three.js wordt van een CDN geladen,
dus een internetverbinding is nodig. Voor de zekerheid kun je de map ook lokaal
serveren:

```bash
cd games/fort-boekoe
python3 -m http.server 8099
# open daarna http://localhost:8099 in je browser
```

### Besturing — desktop

| Toets | Actie |
|-------|-------|
| `W A S D` | Lopen |
| Muis | Rondkijken (klik eerst om de muis te vergrendelen) |
| Klik | Schieten |
| `R` | Herladen |
| `E` | Info-punt bekijken (verkenningsfase) |
| `F` | Belegering starten (na alles bekeken te hebben) |
| `Shift` | Rennen |

### Besturing — mobiel

Touchbediening verschijnt automatisch op telefoon/tablet:

- **Joystick linksonder** — lopen
- **Sleep in de rechterhelft** — rondkijken
- **VUUR / HERLAAD / BEKIJK** — knoppen rechtsonder

## Twee fasen

1. **Verkenning** — loop door het fort en bekijk de gouden info-ringen: de vlag,
   het kampvuur, de hutten, de palissade en de draaibassen. Elk punt vertelt een
   stukje geschiedenis.
2. **Belegering** — de Zwarte Jagers (*Redi Musu*) naderen door het moeras.
   Houd de palissade en de moraal overeind tot **Boni langs de verborgen
   waterpaden is ontkomen**. Het fort valt — zoals in de geschiedenis — maar de
   mensen overleven.

## Historische achtergrond

- Fort Boekoe werd in **1771** gesticht op een zandrits in het moeras, ten oosten
  van de Barbakoebakreek. De naam *Boekoe* betekent "tot stof vergaan".
- De vesting had een **palissade van vijf meter** met schietgaten, **twee
  draaibassen**, en toegangspaden die deels **onder water** verborgen lagen.
- Leiders waren **Boni**, **Baron** en **Jasmin/Jolicoeur**. In september 1771
  woonden er ongeveer **83 mensen** (50 mannen, 24 vrouwen, 9 kinderen).
- De vlag toonde **een zwart-witte leeuw op gele grond met zwarte rand**.
- Na eerdere aanvallen (o.a. door kapitein **Oorsinga**) viel het fort op
  **20 september 1772**: de Zwarte Jagers braken in een half uur door de
  palissade. **Boni en de leiders ontkwamen**; het verzet duurde voort tot 1776.

### Bronnen

- <https://nl.wikipedia.org/wiki/Fort_Boekoe>
- <https://nl.wikipedia.org/wiki/Marrons_van_Suriname>
- <https://kibrimi.sr/fort-boekoe/>

> Dit is een interactief, respectvol eerbetoon. Personen, plaatsen en gebeurtenissen
> zijn historisch; de 3D-reconstructie is een artistieke benadering, geen exacte
> archeologische weergave.
