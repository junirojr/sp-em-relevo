import { readFileSync } from "node:fs";
import { a } from "../src/domain/a.js";
import { b } from "./b.js";

export const value = [readFileSync, a, b];
