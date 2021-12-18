/**
 * notion-enhancer
 * (c) 2021 dragonwocky <thedragonring.bod@gmail.com> (https://dragonwocky.me/)
 * (https://notion-enhancer.github.io/) under the MIT license
 */

/// <reference lib="dom" />

"use strict";

import { html, safe } from "./utils.ts";
import FuzzySet from "https://cdn.skypack.dev/fuzzyset.js";
import featherIcons from "https://cdn.skypack.dev/feather-icons";

interface SearchResult {
  url: string;
  type: "page" | "heading" | "inline";
  section: string;
  page?: string;
  text: string;
}

const $: Record<string, () => HTMLElement> = {};
$.open = () =>
  <HTMLElement> document.querySelector('[data-action="open-search"]');
$.container = () =>
  <HTMLElement> document.querySelector('aside[aria-label="search"]');
$.input = () =>
  <HTMLInputElement> $.container().querySelector('input[type="search"]');
$.clear = () =>
  <HTMLElement> $.container().querySelector('[data-action="clear-search"]');
$.close = () =>
  <HTMLElement> $.container().querySelector('[data-action="close-search"]');
$.results = () =>
  <HTMLElement> $.container().querySelector('[aria-label="results"]');

const gui: Record<string, () => unknown> = {};
gui.isOpen = () => !$.container().classList.contains("opacity-0");
gui.open = () => {
  $.container().classList.remove("pointer-events-none", "opacity-0");
  $.input().focus();
};
gui.close = () => {
  $.container().classList.add("pointer-events-none", "opacity-0");
  $.input().blur();
};
gui.toggle = () => gui.isOpen() ? gui.close() : gui.open();
gui.clear = () => {
  (<HTMLInputElement> $.input()).value = "";
  $.results().innerHTML = "";
};
gui.focusPrev = () => {
  if (!gui.isOpen()) return;
  if (document.activeElement === $.input()) {
    $.results().lastElementChild?.querySelector("a")?.focus();
  } else if ($.results().contains(document.activeElement)) {
    ((<HTMLElement> document.activeElement).closest("li")
      ?.previousElementSibling?.querySelector("a") ?? $.input())?.focus();
  }
  requestAnimationFrame(() => {
    (<HTMLElement> document.activeElement).scrollIntoView();
  });
};
gui.focusNext = () => {
  if (!gui.isOpen()) return;
  const $first = $.results().querySelector("a");
  if (document.activeElement === $.input()) {
    $first?.focus();
  } else if ($.results().contains(document.activeElement)) {
    ((<HTMLElement> document.activeElement).closest("li")
      ?.nextElementSibling?.querySelector("a") ?? $first)?.focus();
  }
  requestAnimationFrame(() => {
    (<HTMLElement> document.activeElement).scrollIntoView();
  });
};

// deno-lint-ignore no-explicit-any
const widgets: Record<string, (...args: any) => HTMLElement | string> = {};
widgets.highlight = (str: string, query: string) => {
  const caseInsensitive = `(${
    safe(query).replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&")
  })`;
  return str.replace(
    new RegExp(caseInsensitive, "ig"),
    (match) => `<mark class="search-result-highlight">${match}</mark>`,
  );
};
widgets.result = (result: SearchResult, query: string) => {
  const icon = result.type === "page"
    ? "file-text"
    : (result.type === "heading" ? "hash" : "align-left");
  const $result = html`<li>
    <a href="${safe(result.url)}" class="search-result group">
      ${featherIcons.icons[icon].toSvg({ class: "search-result-icon" })}
      <div class="font-medium">
        <p class="text-sm">${widgets.highlight(safe(result.text), query)}</p>
        ${result.page ? `<p class="text-xs">${safe(result.page)}</p>` : ""}
      </div>
    </a>
  </li>`;
  $result.addEventListener("click", gui.close);
  return $result;
};
widgets.section = (section: string, results: SearchResult[], query: string) => {
  const $section = html`<ul>
    <li class="search-result-section">${safe(section)}</li>
  </ul>`;
  for (const result of results) $section.append(widgets.result(result, query));
  return $section;
};

const _indexCache: SearchResult[] = [],
  fetchIndex = async () => {
    if (_indexCache.length) return _indexCache;
    const res = await fetch("/search-index.json");
    _indexCache.push(...(await res.json()));
    return _indexCache;
  };

const _fuzzyCache: Record<string, Record<string, number>> = {},
  fuzzyMatch = (a: string, b: string): number => {
    if (!_fuzzyCache[a]) _fuzzyCache[a] = {};
    if (_fuzzyCache[a][b] === undefined) {
      const fuzzy = FuzzySet();
      fuzzy.add(a);
      _fuzzyCache[a][b] = fuzzy.get(b, [[0]])[0][0];
    }
    return _fuzzyCache[a][b];
  },
  exactMatch = (a: string, b: string): boolean =>
    a.toLowerCase().includes(b.toLowerCase());

const _matchCache = { query: "", results: [] as SearchResult[] },
  search = async () => {
    const query = (<HTMLInputElement> $.input()).value.toLowerCase(),
      index = query
        ? (_matchCache.results.length && _matchCache.query &&
            query.startsWith(_matchCache.query)
          ? _matchCache.results
          : (await fetchIndex()))
        : (await fetchIndex()).filter((result) => result.type === "page"),
      exact = index.filter((result) => exactMatch(result.text, query)),
      fuzzy = index.filter((result) => !exact.includes(result))
        .filter((result) => fuzzyMatch(result.text, query))
        .sort((a, b) => fuzzyMatch(a.text, query) - fuzzyMatch(b.text, query)),
      matches = [...exact, ...fuzzy],
      grouped = matches.reduce((groups, result) => {
        if (!groups[result.section]) groups[result.section] = [];
        groups[result.section].push(result);
        return groups;
      }, {} as Record<string, SearchResult[]>);
    _matchCache.query = query;
    _matchCache.results = matches;

    $.results().innerHTML = "";
    for (const section in grouped) {
      $.results().append(widgets.section(section, grouped[section], query));
    }
  };

const hotkeys = [
  // toggle
  (event: KeyboardEvent) => {
    const hotkey: Partial<KeyboardEvent> = {
      metaKey: false,
      ctrlKey: true,
      shiftKey: false,
      altKey: false,
      key: "k",
    };
    for (const prop in hotkey) {
      const key = <keyof KeyboardEvent> prop;
      if (event[key] !== hotkey[key]) return;
    }
    event.preventDefault();
    gui.toggle();
  },
  // navigation
  (event: KeyboardEvent) => {
    if (!gui.isOpen()) return;
    if (event.key === "Escape") gui.close();
    if (event.key === "ArrowUp") gui.focusPrev();
    if (event.key === "ArrowDown") gui.focusNext();
    if (event.key === "/" && document.activeElement !== $.input()) {
      event.preventDefault();
      $.input().focus();
    }
    if (event.key === "Enter" && document.activeElement === $.input()) {
      gui.focusNext();
      (<HTMLElement> document.activeElement)?.click();
    }
  },
];

export const initSearch = () => {
  gui.clear();
  gui.close();
  fetchIndex().then(() => {
    if (!(<HTMLInputElement> $.input()).value) search();
  });

  $.open().removeEventListener("click", gui.open);
  $.open().addEventListener("click", gui.open);
  $.close().removeEventListener("click", gui.close);
  $.close().addEventListener("click", gui.close);
  $.clear().removeEventListener("click", gui.clear);
  $.clear().addEventListener("click", gui.clear);
  $.input().removeEventListener("input", search);
  $.input().addEventListener("input", search);

  for (const hotkey of hotkeys) {
    document.removeEventListener("keydown", hotkey);
    document.addEventListener("keydown", hotkey);
  }
};
