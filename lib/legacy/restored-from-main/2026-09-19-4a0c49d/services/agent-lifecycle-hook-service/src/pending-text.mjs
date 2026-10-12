/**
 * The text a Write or Edit class tool event will leave on disk, computed purely
 * from the event and the file's current text (supplied by the caller from the
 * file effect owner). Undefined when the event does not describe a text write.
 */
export function pendingFileText({ event, currentText }) {
  const input = event?.tool?.input;
  if (!input || typeof input !== "object") return undefined;
  if (event.tool.name === "Write") return typeof input.content === "string" ? input.content : undefined;
  if (event.tool.name === "Edit") {
    if (typeof input.old_string !== "string" || typeof input.new_string !== "string" || typeof currentText !== "string") return undefined;
    return input.replace_all ? currentText.split(input.old_string).join(input.new_string) : currentText.replace(input.old_string, input.new_string);
  }
  if (event.tool.name === "MultiEdit") {
    if (!Array.isArray(input.edits) || typeof currentText !== "string") return undefined;
    let text = currentText;
    for (const edit of input.edits) {
      if (typeof edit?.old_string !== "string" || typeof edit?.new_string !== "string") return undefined;
      text = edit.replace_all ? text.split(edit.old_string).join(edit.new_string) : text.replace(edit.old_string, edit.new_string);
    }
    return text;
  }
  return undefined;
}
