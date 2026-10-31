import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { deriveSetOfFounderUtterances } from "../scripts/derive-set-of-founder-utterances.mjs";

const examples = [
  {
    "type": "JavascriptNodeOperationExample",
    "name": "keeps one prompt inside the window and reports its session count",
    "input": {
      "transcripts": [
        {
          "session": "aaaaaaaa",
          "lines": [
            "{\"type\":\"user\",\"timestamp\":\"2026-09-02T01:00:00.000Z\",\"message\":{\"content\":\"hello founder\"}}"
          ]
        }
      ],
      "since": "2026-09-02T00:00:00.000Z",
      "until": "2026-09-05T02:05:00.000Z"
    },
    "output": {
      "type": "FounderUtteranceSet",
      "version": 1,
      "since": "2026-09-02T00:00:00.000Z",
      "until": "2026-09-05T02:05:00.000Z",
      "prompts": 1,
      "sessions": {
        "aaaaaaaa": 1
      },
      "rows": [
        {
          "session": "aaaaaaaa",
          "ts": "2026-09-02T01:00:00.000Z",
          "text": "hello founder"
        }
      ]
    }
  }
];

for (const example of examples) {
  test(example.name, async () => {
    const importedOutput = await deriveSetOfFounderUtterances(example.input);
    assert.deepEqual(importedOutput, example.output);
    const command = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/derive-set-of-founder-utterances.mjs", import.meta.url))], {
      input: JSON.stringify(example.input) + "\n",
      encoding: "utf8",
    });
    assert.equal(command.status, 0, command.stderr);
    const commandOutput = JSON.parse(command.stdout.trim());
    assert.deepEqual(commandOutput, example.output);
    assert.deepEqual(commandOutput, importedOutput);
  });
}
