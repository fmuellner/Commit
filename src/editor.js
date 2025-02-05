import Gtk from "gi://Gtk";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import GtkSource from "gi://GtkSource";

import CommitEditor from "./CommitEditor.js";

import { settings } from "./util.js";
import { hasCommitMessage } from "./scm.js";

const HIGHLIGHT_BACKGROUND_TAG_NAME = "highlightBackground";

export default function editor({
  builder,
  commitButton,
  type,
  window,
  parsed,
}) {
  const {
    body,
    comment,
    detail,
    cursor_position,
    read_only_index,
    language,
    comment_prefix,
    capitalize,
  } = parsed;

  if (type) {
    const projectDirectoryName = GLib.path_get_basename(GLib.get_current_dir());
    let title = `${type}: ${projectDirectoryName}`;
    if (detail) title += ` (${detail})`;
    window.set_title(title);
  }

  const commentLines = comment.split("\n");
  const numberOfLinesInComment = commentLines.length;

  // Save the number of lines in the commit message.
  let previousNumberOfLinesInCommitMessage = 1;

  const main = builder.get_object("main");
  const widget = new CommitEditor({ language });
  main.append(widget);
  const source_view = widget.view;

  settings.bind(
    "body-length-wrap",
    widget,
    "wrap-width-request",
    Gio.SettingsBindFlags.DEFAULT,
  );

  const buffer = source_view.get_buffer();
  buffer.set_enable_undo(true);

  // Tag: highlight background.
  const highlightBackgroundTag = Gtk.TextTag.new(HIGHLIGHT_BACKGROUND_TAG_NAME);
  // Works well with light and dark mode
  const [, color] = source_view.get_style_context().lookup_color("yellow_1");
  highlightBackgroundTag.background = color.to_string();
  buffer.tag_table.add(highlightBackgroundTag);

  let has_commit_message = false;

  buffer.connect("changed", () => {
    has_commit_message = hasCommitMessage(buffer.text, comment_prefix);

    commitButton.set_sensitive(has_commit_message);

    // Do not highlight any other type
    if (!["commit", "merge", "hg"].includes(type)) return;

    // Check first line length and highlight characters beyond the limit.
    const text = buffer.text;
    const lines = text.split("\n");
    const firstLine = lines[0];
    const firstLineLength = unicodeLength(firstLine);

    // Get bounding iterators for the first line.
    const startOfTextIterator = buffer.get_start_iter();
    const endOfTextIterator = buffer.get_end_iter();
    const endOfFirstLineIterator = buffer.get_iter_at_offset(firstLineLength);

    // Start with a clean slate: remove any background highlighting on the
    // whole text. (We don’t do just the first line as someone might copy a
    // highlighted piece of the first line and paste it and we don’t want it
    // highlighted on subsequent lines if they do that.)
    buffer.remove_tag_by_name(
      HIGHLIGHT_BACKGROUND_TAG_NAME,
      startOfTextIterator,
      endOfTextIterator,
    );

    const title_length_hint = settings.get_int("title-length-hint");
    // Highlight the overflow area, if any.
    if (firstLineLength > title_length_hint) {
      const startOfOverflowIterator =
        buffer.get_iter_at_offset(title_length_hint);
      buffer.apply_tag(
        highlightBackgroundTag,
        startOfOverflowIterator,
        endOfFirstLineIterator,
      );
    }
  });

  // This is not user undo-able
  // if it was we could wrap it between
  // buffer.begin_irreversible_action();
  // buffer.end_irreversible_action();
  buffer.set_text(`${body}\n${comment}`, -1);

  buffer.place_cursor(buffer.get_iter_at_offset(cursor_position));

  markCommentReadonly({
    buffer,
    read_only_index,
  });

  const capitalizer = Capitalizer({ capitalize, comment_prefix });

  buffer.connect("end-user-action", () => {
    let { cursor_position } = buffer;

    capitalizer(buffer, cursor_position, has_commit_message);

    // Take measurements
    let lines = buffer.text.split("\n");
    let firstLineLength = unicodeLength(lines[0]);
    let numberOfLinesInCommitMessage = lines.length + 1;

    if (
      ["commit", "merge", "hg"].includes(type) &&
      /* in the correct place */
      cursor_position === firstLineLength + 1 &&
      /* and the first line is empty */
      unicodeLength(lines[0].replace(/ /g, "")) === 0 &&
      /* and the second line is empty (to avoid
             https://source.small-tech.org/gnome/gnomit/gjs/issues/27) */
      unicodeLength(lines[1].replace(/ /g, "")) === 0 &&
      /* and person didn’t reach here by deleting existing content */
      numberOfLinesInCommitMessage > previousNumberOfLinesInCommitMessage
    ) {
      // Delete the newline
      buffer.backspace(
        /* iter: */ buffer.get_iter_at_offset(buffer.cursor_position),
        /* interactive: */ true,
        /* default_editable: */ true,
      );

      // Update measurements as the buffer has changed.
      lines = buffer.text.split("\n");
      firstLineLength = unicodeLength(lines[0]);
      cursor_position = buffer.cursor_position;
      numberOfLinesInCommitMessage = lines.length + 1;
    }

    // Add an empty newline to separate the rest
    // of the commit message from the first (summary) line.
    if (
      ["commit", "merge", "hg"].includes(type) &&
      /* in the correct place */
      cursor_position === firstLineLength + 1 &&
      numberOfLinesInCommitMessage === numberOfLinesInComment + 3 &&
      /* and person didn’t reach here by deleting existing content */
      numberOfLinesInCommitMessage > previousNumberOfLinesInCommitMessage
    ) {
      // Insert a second newline.
      const newline = "\n";
      buffer.insert_interactive_at_cursor(
        newline,
        newline.length,
        /* default editable */ true,
      );
    }

    // Save the number of lines in the commit message
    // for comparison in later frames.
    previousNumberOfLinesInCommitMessage = numberOfLinesInCommitMessage;
  });

  // Only select commit message body (not the comment) on select all.
  source_view.connect("select-all", (self, selected) => {
    if (!selected) return;

    // Carry this out on the next stack frame.
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 0, () => {
      // Redo the selection to limit it to the commit message
      // only (exclude the original commit comment).
      const selectStartIterator = buffer.get_start_iter();
      const selectEndIterator = buffer.get_iter_at_mark(
        buffer.get_mark("comment"),
      );
      // buffer.move_mark_by_name('selection_bound', selectEndIterator)
      buffer.select_range(selectStartIterator, selectEndIterator);
      return GLib.SOURCE_REMOVE;
    });

    return false;
  });

  return { source_view, buffer, editor: widget };
}

// Method courtesy: https://stackoverflow.com/questions/51396490/getting-a-string-length-that-contains-unicode-character-exceeding-0xffff#comment89813733_51396686
function unicodeLength(str) {
  return [...str].length;
}

const readonlyTag = Gtk.TextTag.new("readonly");
readonlyTag.editable = false;
function markCommentReadonly({ buffer, read_only_index }) {
  buffer.tag_table.add(readonlyTag);

  const endOfText = buffer.get_end_iter();
  const comment_iter = buffer.get_iter_at_offset(read_only_index - 1);

  buffer.apply_tag(readonlyTag, comment_iter, endOfText);

  // This is used for select-all
  buffer.create_mark("comment", comment_iter, false);
}

function Capitalizer({ capitalize }) {
  let capitalized_first_character;
  let capitalized_after_tag;
  let tag_detected;
  let complete;

  function reset() {
    capitalized_first_character = false;
    capitalized_after_tag = false;
    tag_detected = false;
    complete = !capitalize;
  }

  reset();

  return function capitalizer(buffer, cursor_position, has_commit_message) {
    if (!has_commit_message) {
      reset();
    }

    if (complete) return;

    // First, we upper case the very first letter
    if (cursor_position === 1 && !capitalized_first_character) {
      capitalized_first_character = true;
      if (!buffer.text[0].match(/[a-z]/)) return;
      buffer.change_case(
        GtkSource.ChangeCaseType.UPPER,
        buffer.get_start_iter(),
        buffer.get_iter_at_offset(1),
      );
      return;
    }

    if (capitalized_after_tag) return;

    const last_chars = buffer.text.slice(cursor_position - 3, cursor_position);

    // then, if we detect a tag - like "feat: " - we undo first step
    if (!tag_detected && last_chars.match(/\S: /)) {
      tag_detected = !!buffer
        .get_slice(
          buffer.get_start_iter(),
          buffer.get_iter_at_offset(cursor_position),
          false,
        )
        .match(/^\S+: /);
      if (!tag_detected) {
        complete = true;
        return;
      }

      if (capitalized_first_character) {
        buffer.change_case(
          GtkSource.ChangeCaseType.LOWER,
          buffer.get_start_iter(),
          buffer.get_iter_at_offset(1),
        );
      }
      return;
    }

    // Finally, we uppercase the first latter afte the tag "feat: A"
    if (tag_detected && last_chars.startsWith(": ")) {
      capitalized_after_tag = true;
      buffer.change_case(
        GtkSource.ChangeCaseType.UPPER,
        buffer.get_iter_at_offset(cursor_position - 1),
        buffer.get_iter_at_offset(cursor_position),
      );
      complete = true;
    }
  };
}
