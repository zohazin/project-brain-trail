// Illustrative stock photos for trial/demo listings that have no uploaded photo.
// Freely licensed photos from Wikimedia Commons, cropped to 640x640. They are stored with the Cheez Udhaar copy project
// (lasting-project-notes.lovable.app) and loaded from there, so that site must stay published.
// A real uploaded photo always wins; these are shown only to trial/demo accounts and are always labelled.

const chairsAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/e94b5ffe-0f40-4140-a198-c0f08979686d/sample_chairs.jpg" };
const chairs_woodAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/5ef49293-5753-4a24-9d1c-6e9bbd5a386d/sample_chairs_wood.jpg" };
const projectorAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/e7004c62-eb5e-435b-9667-2a1190dcab50/sample_projector.jpg" };
const drillAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/c92441f5-0e33-4eb9-a09c-dfe06bf21695/sample_drill.jpg" };
const tentAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/372182e2-de57-462c-94f0-775c840d5245/sample_tent.jpg" };
const glueAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/43346f39-193f-4533-897e-f626450b6967/sample_glue.jpg" };
const glue_gunAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/c7f18ad7-d4d0-42a0-9f5f-1bf2aefb69ec/sample_glue_gun.jpg" };
const paintAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/e58ac7f2-55a9-46f8-b957-dace42942951/sample_paint.jpg" };
const ladderAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/e22df8de-5ae0-4875-a62a-5cfba562aba1/sample_ladder.jpg" };
const extensionAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/37853c17-6d98-4fc9-ae27-517465650f12/sample_extension.jpg" };
const cooking_potAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/453ad76c-eaf2-4c1d-9f2c-ab1e122884a4/sample_cooking_pot.jpg" };
const toolboxAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/2c569191-b4eb-47ff-9a33-6a234bb46eb8/sample_toolbox.jpg" };
const sewing_machineAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/0c6edae1-fd9b-4543-8ce9-6643fd98457d/sample_sewing_machine.jpg" };
const ironAsset = { url: "https://lasting-project-notes.lovable.app/__l5e/assets-v1/32944788-de6b-40b8-8661-97375d9b4ff0/sample_iron.jpg" };

export const ILLUSTRATIVE_LABEL = "Illustrative photo";

export type SamplePhoto = { key: string; url: string; subject: string; credit: { author: string; license: string; licenseUrl: string; source: string } };

const PHOTOS: Record<string, SamplePhoto> = {
  chairs: { key: "chairs", url: chairsAsset.url, subject: "folding chairs", credit: { author: "Tony Webster", license: "CC BY 2.0", licenseUrl: "https://creativecommons.org/licenses/by/2.0", source: "https://commons.wikimedia.org/wiki/File:Mess_of_Folding_Chairs_(54273842215).jpg" } },
  chairs_wood: { key: "chairs_wood", url: chairs_woodAsset.url, subject: "wooden folding chairs", credit: { author: "juantiagues", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0", source: "https://commons.wikimedia.org/wiki/File:Despliegue_de_sillas_plegables_de_madera.jpg" } },
  projector: { key: "projector", url: projectorAsset.url, subject: "a projector", credit: { author: "Dave Pape", license: "Public domain", licenseUrl: "", source: "https://commons.wikimedia.org/wiki/File:InFocus_IN34.jpg" } },
  drill: { key: "drill", url: drillAsset.url, subject: "an electric drill", credit: { author: "Helar Lukats", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Makita_18v_electric_drill_(1).jpg" } },
  tent: { key: "tent", url: tentAsset.url, subject: "a camping tent", credit: { author: "Eden Aviv", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Camping_tent_on_tarp.jpg" } },
  glue: { key: "glue", url: glueAsset.url, subject: "a bottle of white glue", credit: { author: "Mk2010", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", source: "https://commons.wikimedia.org/wiki/File:School_glue.JPG" } },
  glue_gun: { key: "glue_gun", url: glue_gunAsset.url, subject: "a hot glue gun", credit: { author: "Evan-Amos", license: "Public domain", licenseUrl: "", source: "https://commons.wikimedia.org/wiki/File:Stanley-Hot-Glue-Gun-GR35K.jpg" } },
  paint: { key: "paint", url: paintAsset.url, subject: "a tin of white paint", credit: { author: "Ionenlaser", license: "CC0", licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Paint_bucket_and_brush.jpg" } },
  ladder: { key: "ladder", url: ladderAsset.url, subject: "a step ladder", credit: { author: "Amin", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Ladder_aluminum.jpg" } },
  extension: { key: "extension", url: extensionAsset.url, subject: "an extension board", credit: { author: "Dmitry Makeev", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Power_strips_with_extension_cord.jpg" } },
  cooking_pot: { key: "cooking_pot", url: cooking_potAsset.url, subject: "a cooking pot", credit: { author: "Matti Blume", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/deed.en", source: "https://commons.wikimedia.org/wiki/File:Pot_(IMG_0261).jpg" } },
  toolbox: { key: "toolbox", url: toolboxAsset.url, subject: "a toolbox", credit: { author: "Rieul Techer", license: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0", source: "https://commons.wikimedia.org/wiki/File:Caisse_%C3%A0_outils_avec_petit_outillage.JPG" } },
  sewing_machine: { key: "sewing_machine", url: sewing_machineAsset.url, subject: "a sewing machine", credit: { author: "Nikodem Nijaki", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", source: "https://commons.wikimedia.org/wiki/File:Vesta_sewing_machine_IMGP0718.jpg" } },
  iron: { key: "iron", url: ironAsset.url, subject: "a clothes iron", credit: { author: "Colin", license: "CC BY-SA 3.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0", source: "https://commons.wikimedia.org/wiki/File:Electric_steam_iron.jpg" } },
};

/** Order matters: more specific kinds first (glue gun before glue, wooden chairs before chairs, drill before tools). */
const RULES: { key: string; any: RegExp; also?: RegExp }[] = [
  { key: "glue_gun", any: /\b(hot\s*glue|glue\s*guns?)\b/ },
  { key: "chairs_wood", any: /\b(chairs?|kursi|kursiy[ao]n|kursian)\b|کرسی|کرسیاں/, also: /\b(wood|wooden|lakri|lakdi|lakṛi)\b|لکڑی/ },
  { key: "chairs", any: /\b(chairs?|kursi|kursiy[ao]n|kursian)\b|کرسی|کرسیاں/ },
  { key: "projector", any: /\b(projectors?|beamer)\b|پروجیکٹر/ },
  { key: "drill", any: /\b(drills?|drill\s*machine|barma)\b|ڈرل/ },
  { key: "tent", any: /\b(tents?|khaima|khema)\b|خیمہ/ },
  { key: "glue", any: /\b(glue|gond|fevicol|adhesive|pva)\b|گوند/ },
  { key: "paint", any: /\b(paints?|emulsion|distemper|enamel)\b|پینٹ/ },
  { key: "ladder", any: /\b(ladders?|seedhi|sirhi|seerhi|sirhi)\b|سیڑھی/ },
  { key: "extension", any: /\b(extension(\s*(board|cord|lead|cable|wire))?|power\s*strip|cable\s*reel)\b/ },
  { key: "sewing_machine", any: /\b(sewing|silai|silaai)\b|سلائی/ },
  { key: "iron", any: /\b(steam\s*iron|clothes\s*iron|press\s*iron|istri|istree)\b|استری|^\s*iron\s*$/ },
  { key: "cooking_pot", any: /\b(pots?|cooking\s*pot|degh|deg|daig|patila|pateela|patili|handi|cookware|saucepan)\b|دیگ|پتیلا/ },
  { key: "toolbox", any: /\b(tool\s*box|toolbox|tool\s*kit|toolkit|tools|hammer|screwdrivers?|spanners?|wrench(es)?|pliers)\b|اوزار/ },
];

function matchText(text: string, combined: string): string | null {
  for (const r of RULES) {
    if (!r.any.test(text)) continue;
    if (r.also && !r.also.test(combined)) continue;
    return r.key;
  }
  return null;
}

/** Picks the stock photo for an item from its name first, then its details (description/specs). Null when nothing fits. */
export function samplePhotoKey(name: string, details?: string | null): string | null {
  const n = (name ?? "").toLowerCase();
  const d = (details ?? "").toLowerCase();
  const combined = `${n} ${d}`;
  return matchText(n, combined) ?? (d ? matchText(d, combined) : null);
}

export function samplePhotoFor(name: string, details?: string | null): SamplePhoto | null {
  const key = samplePhotoKey(name, details);
  return key ? (PHOTOS[key] ?? null) : null;
}

/** Looks up a photo chosen on the server (by key). Unknown or missing keys give null. */
export function samplePhotoByKey(key: string | null | undefined): SamplePhoto | null {
  return key ? (PHOTOS[key] ?? null) : null;
}

export function samplePhotoKeys(): string[] {
  return Object.keys(PHOTOS);
}
