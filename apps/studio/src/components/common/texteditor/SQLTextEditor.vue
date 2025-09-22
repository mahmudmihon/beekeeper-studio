<template>
  <text-editor
    v-bind="$attrs"
    :value="value"
    @input="$emit('input', $event)"
    mode="sql"
    :extra-keybindings="keybindings"
    :columns-getter="columnsGetter"
    :context-menu-options="handleContextMenuOptions"
    :extensions="extensions"
    :auto-focus="true"
    @update:focus="$emit('update:focus', $event)"
    @update:selection="$emit('update:selection', $event)"
    @update:cursorIndex="$emit('update:cursorIndex', $event)"
    @update:cursorIndexAnchor="$emit('update:cursorIndexAnchor', $event)"
    @update:initialized="$emit('update:initialized', $event)"
  />
</template>

<script lang="ts">
import Vue from "vue";
import TextEditor from "./TextEditor.vue";
import { mapState, mapGetters } from "vuex";
import { format } from "sql-formatter";
import { FormatterDialect, dialectFor } from "@shared/lib/dialects/models";
import {
  createAutoquoteExtension,
  createAutocompleteExtension,
  createRemoveQueryQuotesExtension,
  createQueryMagicExtension
} from "@/lib/editor/CodeMirrorPlugins";

export default Vue.extend({
  components: { TextEditor },
  props: ["value", "connectionType", "extraKeybindings", "contextMenuOptions"],
  computed: {
    ...mapGetters(['defaultSchema', 'dialectData', 'isUltimate']),
    ...mapState(["tables"]),
    keybindings() {
      return {
        "Shift-Ctrl-F": this.formatSql,
        "Shift-Cmd-F": this.formatSql,
        ...this.extraKeybindings,
      };
    },
    extensions() {
      const editorExtensions = [
        createAutoquoteExtension(),
        createAutocompleteExtension(),
        createRemoveQueryQuotesExtension(this.queryDialect),
        createQueryMagicExtension(() => this.defaultSchema, () => this.tables)
      ];

      return editorExtensions;
    },
    queryDialect() {
      return this.dialectData.queryDialectOverride ?? this.connectionType
    }
  },
  methods: {
    formatSql() {
      const formatted = format(this.value, {
        language: FormatterDialect(dialectFor(this.queryDialect)),
      });
      this.$emit("input", formatted);
    },
    async columnsGetter(tableName: string) {
      let tableToFind = this.tables.find(
        (t) => t.name === tableName || `${t.schema}.${t.name}` === tableName
      );
      if (!tableToFind) return null;
      // Only refresh columns if we don't have them cached.
      if (!tableToFind.columns?.length) {
        await this.$store.dispatch("updateTableColumns", tableToFind);
        tableToFind = this.tables.find(
          (t) => t.name === tableName || `${t.schema}.${t.name}` === tableName
        );
      }

      return tableToFind?.columns.map((c) => c.columnName);
    },
    handleContextMenuOptions(e: unknown, options: any[]) {
      const pivot = options.findIndex((o) => o.slug === "find");
      const newOptions = [
        ...options.slice(0, pivot),
        {
          name: "Format Query",
          slug: "format",
          handler: this.formatSql,
          shortcut: this.ctrlOrCmd("shift+f"),
        },
        {
          type: "divider",
        },
        ...options.slice(pivot),
      ];

      if (this.contextMenuOptions) {
        return this.contextMenuOptions(e, newOptions);
      }

      return newOptions;
    },
  },
});
</script>
