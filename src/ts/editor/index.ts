import {gfm} from "turndown-plugin-gfm/lib/turndown-plugin-gfm.es.js";
import {uploadFiles} from "../upload/index";
import {commandable} from "../util/commandable";

class Editor {
    public element: HTMLTextAreaElement;

    constructor(vditor: IVditor) {
        this.element = document.createElement("textarea");
        this.element.className = "vditor-textarea";
        this.element.setAttribute("placeholder", vditor.options.placeholder);
        if (vditor.options.cache) {
            this.element.value = localStorage.getItem("vditor" + vditor.id);
            if (vditor.options.counter > 0) {
                vditor.counter.render(this.element.value.length, vditor.options.counter);
            }
        }
        this.bindEvent(vditor);
    }

    private html2md(TurndownService: ITurndown, vditor: IVditor, textHTML: string, textPlain: string) {
        let onlyMultiCode = false;
        // no escape
        TurndownService.prototype.escape = (name: string) => {
            return name;
        };

        const turndownService = new TurndownService();

        turndownService.addRule("strikethrough", {
            filter: ["pre", "code"],
            replacement: (content: string, node: HTMLElement) => {
                if (node.parentElement.tagName === "PRE") {
                    return content;
                }
                if (content.split("\n").length > 1) {
                    onlyMultiCode = true;
                    return "```\n" + content + "\n```";
                }
                return "`" + content + "`";
            },
        });
        turndownService.addRule("strikethrough", {
            filter: ["img"],
            replacement: (content: string, target: HTMLElement) => {
                if (!target.getAttribute("src")) {
                    return "";
                }
                if (vditor.options.upload.linkToImgUrl) {
                    const xhr = new XMLHttpRequest();
                    xhr.open("POST", vditor.options.upload.linkToImgUrl);
                    xhr.onreadystatechange = () => {
                        if (xhr.readyState === XMLHttpRequest.DONE) {
                            if (xhr.status === 200) {
                                const responseJSON = JSON.parse(xhr.responseText);
                                if (responseJSON.code !== 0) {
                                    alert(responseJSON.msg);
                                    return;
                                }
                                const original = target.getAttribute("src");
                                vditor.editor.element.selectionStart =
                                    vditor.editor.element.value.split(original)[0].length;
                                vditor.editor.element.selectionEnd =
                                    vditor.editor.element.selectionStart + original.length;
                                insertText(vditor.editor.element, responseJSON.data.url, "", true);
                            }
                        }
                    };
                    xhr.send(JSON.stringify({url: target.getAttribute("src")}));
                }

                return `![${target.getAttribute("alt")}](${target.getAttribute("src")})`;
            },
        });

        turndownService.use(gfm);

        const markdownStr = turndownService.turndown(textHTML);

        if (onlyMultiCode) {
            const tempElement = document.createElement("div");
            tempElement.innerHTML = textHTML;
            if (tempElement.querySelectorAll("pre").length > 1) {
                onlyMultiCode = false;
            } else if (markdownStr.substr(0, 3) !== "```" ||
                markdownStr.substr(markdownStr.length - 3, 3) !== "```") {
                onlyMultiCode = false;
            }
        }
        if (onlyMultiCode) {
            insertText(vditor.editor.element,
                "```\n" + textPlain + "\n```",
                "", true);
        } else {
            insertText(vditor.editor.element, markdownStr, "", true);
        }
    }

    private bindEvent(vditor: IVditor) {
        this.element.addEventListener("input", () => {
            if (vditor.options.counter > 0) {
                vditor.counter.render(this.element.value.length, vditor.options.counter);
            }

            if (typeof vditor.options.input === "function") {
                vditor.options.input(this.element.value, vditor.preview && vditor.preview.element);
            }

            if (vditor.hint) {
                vditor.hint.render();
            }

            if (vditor.options.cache) {
                localStorage.setItem(`vditor${vditor.id}`, vditor.editor.element.value);
            }

            if (vditor.preview) {
                vditor.preview.render(vditor);
            }
        });

        this.element.addEventListener("focus", () => {
            if (vditor.options.focus) {
                vditor.options.focus(this.element.value);
            }
            if (vditor.toolbar.elements.emoji && vditor.toolbar.elements.emoji.children[1]) {
                const emojiPanel = vditor.toolbar.elements.emoji.children[1] as HTMLElement;
                emojiPanel.style.display = "none";
            }
            if (vditor.toolbar.elements.headings && vditor.toolbar.elements.headings.children[1]) {
                const headingsPanel = vditor.toolbar.elements.headings.children[1] as HTMLElement;
                headingsPanel.style.display = "none";
            }
        });

        this.element.addEventListener("blur", () => {
            if (vditor.options.blur) {
                vditor.options.blur(this.element.value);
            }
        });

        if (vditor.options.select) {
            this.element.onselect = () => {
                vditor.options.select(this.element.value.substring(
                    this.element.selectionStart, this.element.selectionEnd));
            };
        }
        this.element.addEventListener("scroll", () => {
            if (vditor.preview.element.style.display === "none" && !vditor.preview) {
                return;
            }
            const textScrollTop = this.element.scrollTop;
            const textHeight = this.element.clientHeight;
            const textScrollHeight = this.element.scrollHeight;
            const preview = vditor.preview.element;
            if ((textScrollTop / textHeight > 0.5)) {
                preview.scrollTop = (textScrollTop + textHeight) *
                    preview.scrollHeight / textScrollHeight - textHeight;
            } else {
                preview.scrollTop = textScrollTop *
                    preview.scrollHeight / textScrollHeight;
            }
        });

        if (vditor.options.upload.url) {
            this.element.addEventListener("drop", (event: CustomEvent & { dataTransfer?: DataTransfer }) => {
                event.stopPropagation();
                event.preventDefault();

                const files = event.dataTransfer.items;
                if (files.length === 0) {
                    return;
                }

                uploadFiles(vditor, files);
            });
        }

        let TurndownService: ITurndown;
        const html2md = this.html2md;
        this.element.addEventListener("paste", (event: Event) => {
            event.stopPropagation();
            event.preventDefault();
            const clipboardEvent: ClipboardEvent = event as ClipboardEvent;
            if (clipboardEvent.clipboardData.getData("text/html").replace(/(^\s*)|(\s*)$/g, "") !== "") {
                const textHTML = clipboardEvent.clipboardData.getData("text/html");
                const textPlain = clipboardEvent.clipboardData.getData("text/plain");
                if (!TurndownService) {
                    import(/* webpackChunkName: "vditor" */ "turndown").then((turndown) => {
                        TurndownService = turndown.default;
                        html2md(TurndownService, vditor, textHTML, textPlain);
                    }).catch((err) => {
                        console.error("Failed to load turndown", err);
                    });
                    return;
                }
                html2md(TurndownService, vditor, textHTML, textPlain);

            } else if (clipboardEvent.clipboardData.getData("text/plain").replace(/(^\s*)|(\s*)$/g, "") !== "" &&
                clipboardEvent.clipboardData.files.length === 0) {
                insertText(event.target as HTMLTextAreaElement,
                    clipboardEvent.clipboardData.getData("text/plain"), "", true);
            } else if (clipboardEvent.clipboardData.files.length > 0) {
                // upload file
                if (!vditor.options.upload.url) {
                    return;
                }
                // NOTE: not work in Safari.
                // maybe the browser considered local filesystem as the same domain as the pasted data
                uploadFiles(vditor, clipboardEvent.clipboardData.files);
            }
        });
    }
}

const insertText = (textarea: HTMLTextAreaElement, prefix: string, suffix: string, replace?: boolean) => {
    if (typeof textarea.selectionStart === "number" && typeof textarea.selectionEnd === "number") {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const tmpStr = textarea.value;
        textarea.focus();
        if (!commandable()) {
            if (startPos === endPos) {
                // no selection
                textarea.value = tmpStr.substring(0, startPos) + prefix + suffix +
                    tmpStr.substring(endPos, tmpStr.length);
                textarea.selectionEnd = textarea.selectionStart = endPos + prefix.length;
            } else {
                if (replace) {
                    textarea.value = tmpStr.substring(0, startPos) + prefix + suffix +
                        tmpStr.substring(endPos, tmpStr.length);
                    textarea.selectionEnd = startPos + prefix.length + suffix.length;
                } else {
                    if (tmpStr.substring(startPos - prefix.length, startPos) === prefix &&
                        tmpStr.substring(endPos, endPos + suffix.length) === suffix) {
                        // broke circle, avoid repeat
                        textarea.value = tmpStr.substring(0, startPos - prefix.length) +
                            tmpStr.substring(startPos, endPos) +
                            tmpStr.substring(endPos + suffix.length, tmpStr.length);
                        textarea.selectionStart = startPos - prefix.length;
                        textarea.selectionEnd = endPos - prefix.length;
                    } else {
                        // insert
                        textarea.value = tmpStr.substring(0, startPos) + prefix +
                            tmpStr.substring(startPos, endPos) +
                            suffix + tmpStr.substring(endPos, tmpStr.length);
                        textarea.selectionStart = startPos + prefix.length;
                        textarea.selectionEnd = endPos + prefix.length;
                    }
                }
            }

            const event = document.createEvent("HTMLEvents");
            event.initEvent("input", true, false);
            textarea.dispatchEvent(event);
        } else {
            if (startPos === endPos) {
                // no selection
                document.execCommand("insertText", false, prefix + suffix);
                textarea.selectionStart = textarea.selectionEnd = textarea.selectionStart - suffix.length;
            } else {
                if (replace) {
                    document.execCommand("insertText", false, prefix + suffix);
                } else {
                    if (tmpStr.substring(startPos - prefix.length, startPos) === prefix &&
                        tmpStr.substring(endPos, endPos + suffix.length) === suffix) {
                        // broke circle, avoid repeat
                        document.execCommand("delete", false);
                        for (let i = 0, iMax = prefix.length; i < iMax; i++) {
                            document.execCommand("delete", false);
                        }
                        for (let j = 0, jMax = suffix.length; j < jMax; j++) {
                            document.execCommand("forwardDelete", false);
                        }
                        document.execCommand("insertText", false,
                            tmpStr.substring(startPos, endPos));
                        textarea.selectionStart = startPos - prefix.length;
                        textarea.selectionEnd = endPos - prefix.length;
                    } else {
                        // insert
                        document.execCommand("insertText", false,
                            prefix + tmpStr.substring(startPos, endPos) + suffix);
                        textarea.selectionStart = startPos + prefix.length;
                        textarea.selectionEnd = endPos + prefix.length;
                    }
                }
            }
        }
    }
};

export {Editor, insertText};
