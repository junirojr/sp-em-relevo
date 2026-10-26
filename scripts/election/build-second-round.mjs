// @ts-nocheck
import fs from "node:fs";

const ELECTION_CODE = "6258";
const BASE_URL = `https://resultados.tse.jus.br/oficial/ele2026/${ELECTION_CODE}`;

async function main() {
  console.log("1. Buscando configuracao de municipios do TSE...");
  const configRes = await fetch(`${BASE_URL}/config/mun-e006258-cm.json`);
  if (!configRes.ok) {
    throw new Error(`Falha ao obter configuracao municipal: HTTP ${configRes.status}`);
  }
  const configData = await configRes.json();

  // Filtrar SP
  const spAbr = configData.abr.find((a) => a.cd === "sp");
  if (!spAbr) {
    throw new Error("UF SP nao encontrada na configuracao municipal do TSE");
  }

  // Mapa cdi (IBGE) -> cd (TSE)
  const ibgeToTse = new Map();
  const tseToIbge = new Map();
  for (const mun of spAbr.mu) {
    ibgeToTse.set(String(mun.cdi), String(mun.cd));
    tseToIbge.set(String(mun.cd), String(mun.cdi));
  }
  console.log(`Mapeados ${ibgeToTse.size} municipios em SP.`);

  console.log("2. Buscando totalizacao estadual de SP...");
  const stateRes = await fetch(`${BASE_URL}/dados/sp/sp-c0001-e006258-u.json`);
  if (!stateRes.ok) {
    throw new Error(`Falha ao obter totalizacao estadual: HTTP ${stateRes.status}`);
  }
  const stateData = await stateRes.json();

  // Carregar lista de municipios do projeto a partir de municipalities.json (formato colunar rows)
  const municipalitiesRaw = JSON.parse(fs.readFileSync("data/municipalities.json", "utf-8"));
  const munRows = municipalitiesRaw.rows || [];
  const munCodes = munRows.map((r) => String(r[0]));
  console.log(`Carregados ${munCodes.length} municipios de data/municipalities.json.`);

  console.log(`3. Baixando resultados dos ${munCodes.length} municipios...`);
  const rows = [];
  const batchSize = 25;
  let processed = 0;

  for (let i = 0; i < munCodes.length; i += batchSize) {
    const chunk = munCodes.slice(i, i + batchSize);
    const promises = chunk.map(async (ibgeCode) => {
      const tseCode = ibgeToTse.get(ibgeCode);
      if (!tseCode) {
        console.warn(`Codigo IBGE ${ibgeCode} nao encontrado no TSE`);
        return null;
      }
      const paddedTse = tseCode.padStart(5, "0");
      const munUrl = `${BASE_URL}/dados/sp/sp${paddedTse}-c0001-e006258-u.json`;
      try {
        const r = await fetch(munUrl);
        if (!r.ok) {
          console.warn(`HTTP ${r.status} para mun ${ibgeCode} (${tseCode})`);
          return null;
        }
        const data = await r.json();
        return { ibgeCode, data };
      } catch (err) {
        console.error(`Erro ao buscar mun ${ibgeCode}:`, err);
        return null;
      }
    });

    const results = await Promise.all(promises);
    for (const item of results) {
      if (!item) continue;
      const { ibgeCode, data } = item;
      const carg = data.carg?.[0];
      const v = data.v || {};
      const validVotes = Number(v.vv || v.vvc || v.tv || 0);
      const blankVotes = Number(v.vb || 0);
      const nullVotes = Number(v.tvn || v.vn || 0);

      // Votos dos candidatos
      const candVotes = [];
      const agr = carg?.agr || [];
      for (const ag of agr) {
        const par = ag.par || [];
        for (const p of par) {
          const candList = p.cand || [];
          for (const c of candList) {
            const num = String(c.n);
            const votes = Number(c.vap || 0);
            candVotes.push([num, votes]);
          }
        }
      }
      candVotes.sort((a, b) => b[1] - a[1]);

      rows.push([ibgeCode, validVotes, blankVotes, nullVotes, 0, 0, candVotes]);
    }

    processed += chunk.length;
    process.stdout.write(`\rProcessados ${processed}/${munCodes.length} municipios...`);
  }
  console.log("\nTodos os municipios processados!");

  // Extrair totais estaduais
  const stateCarg = stateData.carg?.[0];
  const stateV = stateData.v || {};
  const stateValid = Number(stateV.vv || stateV.vvc || stateV.tv || 0);
  const stateBlank = Number(stateV.vb || 0);
  const stateNull = Number(stateV.tvn || stateV.vn || 0);
  const stateCandVotes = [];
  for (const ag of stateCarg?.agr || []) {
    for (const p of ag.par || []) {
      for (const c of p.cand || []) {
        stateCandVotes.push([String(c.n), Number(c.vap || 0)]);
      }
    }
  }
  stateCandVotes.sort((a, b) => b[1] - a[1]);

  // Mapear cada mun para RA e RG usando munRows
  const munToRa = new Map();
  const munToRg = new Map();
  for (const r of munRows) {
    const c = String(r[0]);
    munToRa.set(c, String(r[2]));
    munToRg.set(c, String(r[3]));
  }

  // Acumular por RA e RG
  const raTotals = {};
  const rgTotals = {};
  for (const row of rows) {
    const [c, valid, blank, nullV, , , cVotes] = row;
    const ra = munToRa.get(c);
    const rg = munToRg.get(c);

    if (ra) {
      if (!raTotals[ra]) {
        raTotals[ra] = { validVotes: 0, blankVotes: 0, nullVotes: 0, demais: 0, voteMap: {} };
      }
      raTotals[ra].validVotes += valid;
      raTotals[ra].blankVotes += blank;
      raTotals[ra].nullVotes += nullV;
      for (const [cand, votes] of cVotes) {
        raTotals[ra].voteMap[cand] = (raTotals[ra].voteMap[cand] || 0) + votes;
      }
    }

    if (rg) {
      if (!rgTotals[rg]) {
        rgTotals[rg] = { validVotes: 0, blankVotes: 0, nullVotes: 0, demais: 0, voteMap: {} };
      }
      rgTotals[rg].validVotes += valid;
      rgTotals[rg].blankVotes += blank;
      rgTotals[rg].nullVotes += nullV;
      for (const [cand, votes] of cVotes) {
        rgTotals[rg].voteMap[cand] = (rgTotals[rg].voteMap[cand] || 0) + votes;
      }
    }
  }

  const formattedRa = {};
  for (const [raKey, val] of Object.entries(raTotals)) {
    const arr = Object.entries(val.voteMap).sort((a, b) => b[1] - a[1]);
    formattedRa[raKey] = {
      validVotes: val.validVotes,
      blankVotes: val.blankVotes,
      nullVotes: val.nullVotes,
      demais: 0,
      votes: arr,
    };
  }

  const formattedRg = {};
  for (const [rgKey, val] of Object.entries(rgTotals)) {
    const arr = Object.entries(val.voteMap).sort((a, b) => b[1] - a[1]);
    formattedRg[rgKey] = {
      validVotes: val.validVotes,
      blankVotes: val.blankVotes,
      nullVotes: val.nullVotes,
      demais: 0,
      votes: arr,
    };
  }

  // Ordenar rows pela ordem exata dos munCodes
  rows.sort((a, b) => munCodes.indexOf(a[0]) - munCodes.indexOf(b[0]));

  const output = {
    schemaVersion: 1,
    office: "presidente",
    officeCode: 1,
    electionCode: "6258",
    description: "Presidente da Republica - 2o Turno 2026 (SP)",
    candidates: [
      ["22", "Flavio Bolsonaro", "PL"],
      ["13", "Lula", "PT"],
    ],
    columns: [
      "code",
      "validVotes",
      "blankVotes",
      "nullVotes",
      "demais",
      "tenthPlaceVotes",
      "votes",
    ],
    totals: {
      state: {
        validVotes: stateValid,
        blankVotes: stateBlank,
        nullVotes: stateNull,
        demais: 0,
        votes: stateCandVotes,
      },
      ra: formattedRa,
      rg: formattedRg,
    },
    rows,
  };

  const outPath = "data/election/presidente-2t.json";
  fs.writeFileSync(outPath, JSON.stringify(output), "utf-8");
  console.log(
    `\nArquivo gerado com sucesso: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`,
  );

  // Gerar tambem data/election/replay-presidente-2t.json com os dados reais consolidados de SP!
  const replayMunicipalities = {};
  for (const row of rows) {
    const [c, valid, , , , , cVotes] = row;
    const leader = cVotes[0]?.[0] || "22";
    const _second = cVotes[1]?.[0] || "13";
    const leadVotes = cVotes[0]?.[1] || 0;
    const secVotes = cVotes[1]?.[1] || 0;
    const marginPp = valid > 0 ? Number((((leadVotes - secVotes) / valid) * 100).toFixed(2)) : 0;
    // [leader, marginPp, pctSections]
    replayMunicipalities[c] = [leader, marginPp, 100.0];
  }

  const replayLeader = stateCandVotes[0]?.[0] || "22";
  const _replaySecond = stateCandVotes[1]?.[0] || "13";
  const replayLeadVotes = stateCandVotes[0]?.[1] || 0;
  const replaySecVotes = stateCandVotes[1]?.[1] || 0;
  const replayMarginPp =
    stateValid > 0
      ? Number((((replayLeadVotes - replaySecVotes) / stateValid) * 100).toFixed(2))
      : 0;

  const replayOutput = {
    schema_version: 1,
    election_code: "6258",
    created_at: new Date().toISOString(),
    start_time: "2026-10-25T17:00:00.000Z",
    end_time: "2026-10-25T23:27:11.000Z",
    total_frames: 1,
    sampling_interval_seconds: 60,
    gap_threshold_seconds: 300,
    total_gaps: 0,
    candidates: [
      {
        ballotNumber: "22",
        name: "Flavio Bolsonaro",
        party: "PL",
      },
      {
        ballotNumber: "13",
        name: "Lula",
        party: "PT",
      },
    ],
    summary: {
      total_sections: 103656,
      counted_sections: 103656,
      pct_counted: 100.0,
      leader: replayLeader,
      margin_pp: replayMarginPp,
      municipalities_count: 645,
    },
    frames: [
      {
        t: 0,
        iso: "2026-10-25T23:27:11.000Z",
        sp: [replayLeader, replayMarginPp, 100.0, 103656, 103656],
        muns: replayMunicipalities,
      },
    ],
  };

  const replayPath = "data/election/replay-presidente-2t.json";
  fs.writeFileSync(replayPath, JSON.stringify(replayOutput), "utf-8");
  console.log(
    `Replay gerado com sucesso: ${replayPath} (${(fs.statSync(replayPath).size / 1024).toFixed(1)} KB)`,
  );
}

main().catch(console.error);
