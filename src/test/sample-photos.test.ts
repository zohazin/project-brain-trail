import { describe, expect, it } from "vitest";
import { ILLUSTRATIVE_LABEL, samplePhotoFor, samplePhotoKey, samplePhotoKeys } from "@/lib/sample-photos";

describe("illustrative photos for trial listings", () => {
  it("matches the demo listings to the right photo", () => {
    expect(samplePhotoKey("Folding chairs", "Plastic folding chairs, white. Plastic, foldable")).toBe("chairs");
    expect(samplePhotoKey("Folding chairs", "Wooden folding chairs, sturdy. Wood")).toBe("chairs_wood");
    expect(samplePhotoKey("Projector", "VGA input only, no HDMI")).toBe("projector");
    expect(samplePhotoKey("Electric drill", "500W")).toBe("drill");
    expect(samplePhotoKey("Camping tent", "4 person")).toBe("tent");
    expect(samplePhotoKey("Craft glue", "PVA glue")).toBe("glue");
    expect(samplePhotoKey("Wall paint (white)", "Emulsion")).toBe("paint");
  });

  it("tells a glue gun apart from glue", () => {
    expect(samplePhotoKey("Hot glue gun", "with 10 glue sticks")).toBe("glue_gun");
    expect(samplePhotoKey("Glue gun", "")).toBe("glue_gun");
  });

  it("understands Roman Urdu and Urdu names", () => {
    expect(samplePhotoKey("Plastic kursiyan")).toBe("chairs");
    expect(samplePhotoKey("کرسیاں")).toBe("chairs");
    expect(samplePhotoKey("Badi degh")).toBe("cooking_pot");
    expect(samplePhotoKey("Seedhi")).toBe("ladder");
  });

  it("uses the details when the name alone doesn't say", () => {
    expect(samplePhotoKey("Bosch GSB 500", "Impact drill, 500W")).toBe("drill");
  });

  it("gives no photo when nothing fits (the plain placeholder stays)", () => {
    expect(samplePhotoFor("Wedding dupatta", "Red, embroidered")).toBeNull();
  });

  it("every photo has a source and licence", () => {
    for (const k of samplePhotoKeys()) {
      const p = samplePhotoFor(k.replace("_", " "))!;
      if (!p) continue;
      expect(p.credit.source).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(p.credit.license).not.toBe("");
    }
    expect(ILLUSTRATIVE_LABEL).toBe("Illustrative photo");
  });
});
