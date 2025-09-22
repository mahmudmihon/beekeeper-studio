<template>
  <div
    ref="editorContainer"
    class="text-editor-container"
  />
</template>

<script lang="ts">
import { EditorView, keymap, lineNumbers, drawSelection } from "@codemirror/view";
import { EditorState, Extension, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap, closeBrackets } from "@codemirror/autocomplete";
import { bracketMatching, foldKeymap, indentOnInput, foldGutter } from "@codemirror/language";
import { sql } from "@codemirror/lang-sql";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { vim } from "@replit/codemirror-vim";
import { emacs } from "@replit/codemirror-emacs";
import { Decoration, DecorationSet, WidgetType } from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";
import _ from "lodash";
import {
  setKeybindingsFromVimrc,
  applyConfig,
  Register,
} from "@/lib/editor/vim";
import { AppEvent } from "@/common/AppEvent";
import { keymapTypes } from "@/lib/db/types"
import { EditorMarker, LineGutter } from "@/lib/editor/utils";
import { TextEditorPlugin } from "@/lib/editor/plugins/TextEditorPlugin";
import rawLog from '@bksLogger'

interface InitializeOptions {
  userKeymap?: typeof keymapTypes[number]['value']
}

const log = rawLog.scope('TextEditor')

// State effects for managing decorations
const addMarker = StateEffect.define<EditorMarker>();
const clearMarkers = StateEffect.define();

// State field for managing markers
const markerField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(markers, tr) {
    markers = markers.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(addMarker)) {
        const marker = e.value;
        let decoration;
        if (marker.type === "error") {
          decoration = Decoration.mark({
            class: "bks-error-marker",
            attributes: { title: marker.message }
          });
        } else if (marker.type === "highlight") {
          decoration = Decoration.mark({ class: "highlight" });
        } else if (marker.type === "custom" && marker.element) {
          decoration = Decoration.widget({
            widget: new (class extends WidgetType {
              toDOM() { return marker.element!; }
            })(),
            side: 1
          });
        }
        if (decoration) {
          markers = markers.update({
            add: [decoration.range(marker.from.ch, marker.to.ch)]
          });
        }
      } else if (e.is(clearMarkers)) {
        markers = Decoration.none;
      }
    }
    return markers;
  },
  provide: f => EditorView.decorations.from(f)
});

export default {
  props: [
    "value",
    "mode",
    "hint",
    "keybindings", 
    "vimConfig",
    "lineWrapping",
    "hintOptions",
    "columnsGetter",
    "height",
    "readOnly",
    "focus",
    "contextMenuOptions",
    "extraKeybindings",
    "markers",
    "selection",
    "cursor",
    "initialized",
    "plugins",
    "autoFocus",
    "lineNumbers",
    "foldGutter",
    "removeJsonRootBrackets",
    "forceInitialize",
    "bookmarks",
    "foldAll",
    "unfoldAll",
    "lineGutters",
  ],
  data() {
    return {
      editor: null as EditorView | null,
      editorState: null as EditorState | null,
      foundRootFold: false,
      bookmarkInstances: [],
      markInstances: [],
      activeLineGutters: [],
      wasEditorFocused: false,
      firstInitialization: true,
      initializedPlugins: [],
      themeCompartment: new Compartment(),
      keymapCompartment: new Compartment(),
      languageCompartment: new Compartment(),
    };
  },
  computed: {
    keymapTypes() {
      return this.$config.defaults.keymapTypes;
    },
    hasSelectedText() {
      return this.editorInitialized ? !!this.editor?.state.selection.main.empty === false : false;
    },
    heightAndStatus() {
      return {
        height: this.height,
        status: this.editor != null
      }
    },
    valueAndStatus() {
      return {
        value: this.value,
        status: this.editor != null
      }
    },
    rootBindings() {
      return [
        { event: AppEvent.switchUserKeymap, handler: this.handleSwitchUserKeymap },
      ]
    },
    editorInitialized() {
      return !!this.editor;
    }
  },
  watch: {
    valueAndStatus() {
      const { value, status } = this.valueAndStatus;
      if (!status || !this.editor) return;
      if (this.editor.state.doc.toString() === value) return;
      
      this.editor.dispatch({
        changes: {
          from: 0,
          to: this.editor.state.doc.length,
          insert: value
        }
      });
    },
    forceInitialize() {
      this.initialize({
        userKeymap: this.$store.getters['settings/userKeymap'],
      });
    },
    mode() {
      if (this.editor) {
        this.updateLanguage();
      }
    },
    heightAndStatus() {
      const { height, status } = this.heightAndStatus;
      if (!status || !this.editor) return;
      // CodeMirror 6 handles sizing differently
      if (typeof height === "number") {
        this.editor.dom.style.height = `${height}px`;
      }
    },
    markers() {
      this.initializeMarkers();
    },
    bookmarks() {
      this.initializeBookmarks();
    },
    lineGutters() {
      this.initializeLineGutters();
    },
    foldAll() {
      if (this.foldAll && this.editor) {
        // Implement fold all functionality for CM6
      }
    },
    unfoldAll() {
      if (this.unfoldAll && this.editor) {
        // Implement unfold all functionality for CM6
      }
    },
  },
  methods: {
    focusEditor() {
      if(this.editor && this.autoFocus && this.wasEditorFocused){
        this.editor.focus();
        this.wasEditorFocused = false;
       }
    },
    handleBlur(){
      const activeElement = document.activeElement;
      if(activeElement?.tagName === "TEXTAREA" || activeElement?.className === "tabulator-tableholder"){
        this.wasEditorFocused = true;
      }
    },
    getLanguageExtension() {
      switch (this.mode) {
        case "sql":
          return sql();
        case "javascript":
        case "json":
          return javascript();
        case "html":
          return html();
        case "css":
          return css();
        default:
          return sql(); // Default to SQL
      }
    },
    updateLanguage() {
      if (!this.editor) return;
      this.editor.dispatch({
        effects: this.languageCompartment.reconfigure(this.getLanguageExtension())
      });
    },
    async initialize(options: InitializeOptions = {}) {
      this.destroyEditor();

      const extensions: Extension[] = [
        history(),
        drawSelection(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightSelectionMatches(),
        searchKeymap,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
        this.languageCompartment.of(this.getLanguageExtension()),
        markerField,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.$emit("input", update.state.doc.toString());
          }
          if (update.selectionSet) {
            const selection = update.state.selection.main;
            this.$emit("update:selection", update.state.sliceDoc(selection.from, selection.to));
            this.$emit("update:cursorIndex", selection.head);
            this.$emit("update:cursorIndexAnchor", selection.anchor);
          }
        }),
        EditorView.focusChangeEffect.of((state, focusing) => {
          this.$emit("update:focus", focusing);
          return null;
        })
      ];

      // Add line numbers if enabled
      if (this.lineNumbers ?? true) {
        extensions.push(lineNumbers());
      }

      // Add fold gutter if enabled
      if (this.foldGutter) {
        extensions.push(foldGutter());
      }

      // Add keymap based on user preference
       const userKeymap = options.userKeymap as string;
       if (userKeymap === "vim") {
         extensions.push(vim());
       } else if (userKeymap === "emacs") {
         extensions.push(emacs());
       }

      // Add read-only if specified
      if (this.readOnly) {
        extensions.push(EditorState.readOnly.of(true));
      }

      // Add line wrapping if enabled
      if (this.lineWrapping) {
        extensions.push(EditorView.lineWrapping);
      }

      // Create editor state
      this.editorState = EditorState.create({
        doc: this.value || "",
        extensions
      });

      // Create editor view
      this.editor = new EditorView({
        state: this.editorState,
        parent: this.$refs.editorContainer as HTMLElement
      });

      // Apply height if specified
      if (typeof this.height === "number") {
        this.editor.dom.style.height = `${this.height}px`;
      }

      // Add CSS classes
      const classNames = ["text-editor"];
      if (this.removeJsonRootBrackets) {
        classNames.push("remove-json-root-brackets");
      }
      this.editor.dom.classList.add(...classNames);

      // Initialize plugins
      this.initializePlugins(this.editor);

      // Focus if needed
      if (this.firstInitialization && this.focus) {
        this.editor.focus();
      }

      this.firstInitialization = false;

      this.$nextTick(() => {
        this.initializeMarkers();
        this.initializeBookmarks();
        this.initializeLineGutters();
        this.$emit("update:initialized", true);
      });
    },
    initializeMarkers() {
      const markers: EditorMarker[] = this.markers || [];
      if (!this.editor) return;

      // Clear existing markers
      this.editor.dispatch({
        effects: clearMarkers.of(null)
      });

      // Add new markers
      for (const marker of markers) {
        this.editor.dispatch({
          effects: addMarker.of(marker)
        });
      }
    },
    initializeBookmarks() {
      // TODO: Implement bookmarks for CM6
      const bookmarks = this.bookmarks || [];
      // Implementation needed for CM6 bookmarks
    },
    initializeLineGutters() {
      // TODO: Implement line gutters for CM6
      const lineGutters: LineGutter[] = this.lineGutters || [];
      // Implementation needed for CM6 line gutters
    },
    initializePlugins(editor: EditorView) {
      const plugins: any[] = this.plugins || [];
      this.destroyPlugins();
      
      plugins.forEach((plugin: any) => {
        try {
          if (typeof plugin === "function") {
            const destroy = plugin(editor);
            this.initializedPlugins.push({ destroy });
          } else if (plugin && typeof plugin.initialize === "function") {
            plugin.initialize(editor);
            this.initializedPlugins.push(plugin);
          }
        } catch (e) {
          log.error("Error initializing plugin", e)
        }
      });
    },
    destroyEditor() {
      this.destroyPlugins();
      if (this.editor) {
        this.editor.destroy();
        this.editor = null;
      }
    },
    destroyPlugins() {
      this.initializedPlugins.forEach((plugin: any) => {
        try {
          if (plugin && typeof plugin.destroy === "function") {
            plugin.destroy()
          }
        } catch (e) {
          log.error("Error destroying plugin", e)
        }
      })
      this.initializedPlugins = []
    },
    showContextMenu(event: MouseEvent) {
      const hasSelectedText = this.editor?.state.selection.main.empty === false;
      const selectionDepClass = hasSelectedText ? "" : "disabled";
      const menu = {
        options: [
          {
            name: "Undo",
            handler: () => {
              // CM6 undo implementation
              this.editor?.dispatch({ effects: [] }); // TODO: Implement proper undo
            },
            shortcut: this.ctrlOrCmd("z"),
            write: true,
          },
          {
            name: "Redo", 
            handler: () => {
              // CM6 redo implementation
              this.editor?.dispatch({ effects: [] }); // TODO: Implement proper redo
            },
            shortcut: this.ctrlOrCmd("shift+z"),
            write: true,
          },
          {
            name: "Cut",
            handler: () => {
              if (this.editor) {
                const selection = this.editor.state.selection.main;
                const text = this.editor.state.sliceDoc(selection.from, selection.to);
                this.$native.clipboard.writeText(text);
                this.editor.dispatch({
                  changes: { from: selection.from, to: selection.to, insert: "" }
                });
              }
            },
            class: selectionDepClass,
            shortcut: this.ctrlOrCmd("x"),
            write: true,
          },
          {
            name: "Copy",
            handler: () => {
              if (this.editor) {
                const selection = this.editor.state.selection.main;
                const text = this.editor.state.sliceDoc(selection.from, selection.to);
                this.$native.clipboard.writeText(text);
              }
            },
            class: selectionDepClass,
            shortcut: this.ctrlOrCmd("c"),
          },
          {
            name: "Paste",
            handler: () => {
              if (this.editor) {
                const clipboard = this.$native.clipboard.readText();
                const selection = this.editor.state.selection.main;
                this.editor.dispatch({
                  changes: { from: selection.from, to: selection.to, insert: clipboard }
                });
              }
            },
            shortcut: this.ctrlOrCmd("v"),
            write: true,
          },
          {
            name: "Delete",
            handler: () => {
              if (this.editor) {
                const selection = this.editor.state.selection.main;
                this.editor.dispatch({
                  changes: { from: selection.from, to: selection.to, insert: "" }
                });
              }
            },
            class: selectionDepClass,
            write: true,
          },
          {
            name: "Select All",
            handler: () => {
              if (this.editor) {
                this.editor.dispatch({
                  selection: { anchor: 0, head: this.editor.state.doc.length }
                });
              }
            },
            shortcut: this.ctrlOrCmd("a"),
          },
          {
            type: "divider",
          },
          {
            name: "Find",
            handler: () => {
              // TODO: Implement CM6 search
            },
            shortcut: this.ctrlOrCmd("f"),
          },
        ],
        ...(this.contextMenuOptions || {}),
      };

      this.$store.dispatch("showContextMenu", { event, menu });
    },
    ctrlOrCmd(key: string) {
      const isMac = this.$store.state.platform === "darwin";
      return isMac ? key.replace("Ctrl", "Cmd") : key;
    },
    cmCtrlOrCmd(key: string) {
      return this.ctrlOrCmd(key);
    },
    handleSwitchUserKeymap() {
      this.initialize({
        userKeymap: this.$store.getters['settings/userKeymap'],
      });
    },
  },
  mounted() {
    this.initialize({
      userKeymap: this.$store.getters['settings/userKeymap'],
    });

    this.rootBindings.forEach((binding) => {
      this.$root.$on(binding.event, binding.handler);
    });

    this.$refs.editorContainer?.addEventListener("contextmenu", this.showContextMenu);
    this.$refs.editorContainer?.addEventListener("blur", this.handleBlur);
  },
  beforeDestroy() {
    this.destroyEditor();
    
    this.rootBindings.forEach((binding) => {
      this.$root.$off(binding.event, binding.handler);
    });

    this.$refs.editorContainer?.removeEventListener("contextmenu", this.showContextMenu);
    this.$refs.editorContainer?.removeEventListener("blur", this.handleBlur);
  },
};
</script>

<style scoped>
.text-editor-container {
  height: 100%;
  width: 100%;
}

.text-editor-container :deep(.cm-editor) {
  height: 100%;
}

.text-editor-container :deep(.cm-focused) {
  outline: none;
}
</style>
