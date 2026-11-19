import {
  CreateDataType,
  serializeType,
} from "@antelopejs/interface-dms/base/data-types";
import {
  AssetType,
  type AssetTypeOptions,
} from "@antelopejs/interface-dms-media";
import { expect } from "chai";
import { z } from "zod";

const serializedFieldBody = z.object({
  inputComponent: z.object({
    componentName: z.string(),
    options: z.object({
      multiple: z.boolean().optional(),
      max: z.number().optional(),
      mimetypes: z.array(z.string()).optional(),
      bindingId: z.string().optional(),
    }),
  }),
});

function serializedField(field: AssetType) {
  return serializedFieldBody.parse(
    JSON.parse(JSON.stringify(serializeType(field))),
  );
}

function accepted(options: AssetTypeOptions, values: unknown[]): boolean[] {
  const validation = new AssetType(options).getValidation();
  return values.map((value) => validation.safeParse(value).success);
}

describe("[unit] AssetType — the asset field's value and declaration", () => {
  it("takes one nonempty id by default, whatever the id points at", () => {
    expect(
      accepted({}, ["asset-a", "", ["asset-a"], 3, null, "never-uploaded"]),
    ).to.deep.equal([true, false, false, false, false, true]);
  });

  it("takes an array of nonempty ids when multiple, the empty array included", () => {
    expect(
      accepted({ multiple: true }, [
        [],
        ["asset-a", "asset-b"],
        ["asset-a", ""],
        "asset-a",
        [3],
      ]),
    ).to.deep.equal([true, true, false, false, false]);
  });

  it("caps the array at max in multiple mode only", () => {
    expect(
      accepted({ multiple: true, max: 4 }, [
        ["a", "b", "c", "d"],
        ["a", "b", "c", "d", "e"],
      ]),
    ).to.deep.equal([true, false]);
    expect(accepted({ max: 0 }, ["asset-a"])).to.deep.equal([true]);
  });

  it("does not check the field's mimetypes at validation", () => {
    expect(accepted({ mimetypes: ["image/*"] }, ["a-pdf-id"])).to.deep.equal([
      true,
    ]);
  });

  it("registers the asset data type under the id the dashboard looks up", () => {
    expect(CreateDataType("asset", {})).to.be.instanceOf(AssetType);
  });

  it("declares the picker with the field's options and no binding id without a binding", () => {
    const serialized = serializedField(
      new AssetType({ multiple: true, max: 3, mimetypes: ["image/png"] }),
    );
    expect(serialized.inputComponent.componentName).to.equal(
      "dms-media-asset-picker",
    );
    expect(serialized.inputComponent.options).to.deep.equal({
      multiple: true,
      max: 3,
      mimetypes: ["image/png"],
    });
  });
});
