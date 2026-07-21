import { readFileSync } from "node:fs";

/** 管理页面 HTML(与本文件同目录的 webpage.html;build 时会被 copy 到 dist)。 */
export const PAGE: string = readFileSync(new URL("./webpage.html", import.meta.url), "utf8");
