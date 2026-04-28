import { describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import ts from "typescript"

type TsConfigShape = {
  compilerOptions?: {
    types?: unknown
  }
  include?: unknown
  exclude?: unknown
}

const readTsConfig = async (path: string): Promise<TsConfigShape> => {
  const text = await readFile(new URL(path, import.meta.url), "utf8")
  const parsed = ts.parseConfigFileTextToJson(path, text)

  if (parsed.error) {
    throw new Error(ts.formatDiagnostics([parsed.error], {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    }))
  }

  return parsed.config as TsConfigShape
}

describe("typecheck tsconfig", () => {
  it("loads Bun types and scopes typechecking to source and tests", async () => {
    const tsconfig = await readTsConfig("../../tsconfig.json")

    expect(tsconfig.compilerOptions?.types).toEqual(["bun"])
    expect(tsconfig.include).toEqual(["src/**/*.ts", "test/**/*.ts"])
    expect(tsconfig.exclude).toEqual(["dist", "node_modules"])
  })
})
