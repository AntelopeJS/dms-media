import { HTTPResult } from "@antelopejs/interface-api";
import { expect } from "chai";
import { z } from "zod";
import { portableName, uniqueEntryName } from "../../../library/zip";
import {
  comparableName,
  parseBody,
  updateAssetSchema,
} from "../../../validation/media.schema";

const HTTP_BAD_REQUEST = 400;
const LONG_NAME_LENGTH = 255;
const PORTABLE_LIMIT = 150;

describe("[unit] library/zip — entry names and name rules", () => {
  it("replaces the characters Windows refuses", () => {
    expect(portableName('<b>gras</b> "x" a:b|c?d*.webp')).to.equal(
      "_b_gras__b_ _x_ a_b_c_d_.webp",
    );
  });

  it("drops trailing dots and spaces and guards reserved device names", () => {
    expect(portableName("notes. . ")).to.equal("notes");
    expect(portableName("CON.txt")).to.equal("_CON.txt");
    expect(portableName("nul")).to.equal("_nul");
    expect(portableName("console.txt")).to.equal("console.txt");
  });

  it("keeps accents and emoji but shortens long names, extension kept", () => {
    expect(portableName("Été à Liège 😀.jpg")).to.equal("Été à Liège 😀.jpg");
    const long = `${"a".repeat(LONG_NAME_LENGTH - 4)}.png`;
    const short = portableName(long);
    expect(short.length).to.equal(PORTABLE_LIMIT);
    expect(short.endsWith(".png")).to.equal(true);
  });

  it("numbers clashing entries inside a directory", () => {
    const taken = new Set<string>();
    expect(uniqueEntryName("a?.png", taken, "Sub/")).to.equal("Sub/a_.png");
    expect(uniqueEntryName("A*.png", taken, "Sub/")).to.equal("Sub/A_ (2).png");
    expect(uniqueEntryName("a?.png", taken)).to.equal("a_.png");
  });

  it("compares names regardless of case and Unicode form", () => {
    expect(comparableName(" Été.PNG ")).to.equal(comparableName("été.png"));
  });

  it("turns validation failures into i18n keys", () => {
    const refused = (parse: () => void): HTTPResult => {
      try {
        parse();
      } catch (error) {
        if (error instanceof HTTPResult) return error;
        throw error;
      }
      throw new Error("expected the body to be refused");
    };
    const forbidden = refused(() =>
      parseBody({ name: "a|b.png" }, updateAssetSchema),
    );
    expect(forbidden.getStatus()).to.equal(HTTP_BAD_REQUEST);
    expect(forbidden.getBody()).to.equal("$dms_media.errors.name_forbidden");
    const crashed = refused(() =>
      parseBody(
        {},
        z.unknown().transform(() => {
          throw new Error("boom");
        }),
      ),
    );
    expect(crashed.getStatus()).to.equal(HTTP_BAD_REQUEST);
    expect(crashed.getBody()).to.equal("$dms_media.errors.invalid_request");
  });
});
