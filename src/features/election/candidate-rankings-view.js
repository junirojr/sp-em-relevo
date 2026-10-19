import { buildElectionCandidateRankings } from "../../domain/election-ranking.js";

/**
 * Renders the full candidate comparison and relevance rankings view in the sidebar (R3, F14, F15).
 * Supports both state-wide comparison and municipality-level inspection with winner highlight.
 * Strictly zero 'else' and zero ternary '? :' operators.
 *
 * @param {Document} documentRef
 * @param {HTMLElement} container
 * @returns {{
 *   element: HTMLElement,
 *   update: (data: any) => void,
 *   destroy: () => void
 * }}
 */
export function mountCandidateRankingsView(documentRef, container) {
  container.innerHTML = "";

  const root = documentRef.createElement("div");
  root.id = "election-rankings-view";
  root.className = "election-rankings-card";

  const header = documentRef.createElement("div");
  header.className = "election-rankings-header";
  root.append(header);

  const listContainer = documentRef.createElement("div");
  listContainer.className = "election-rankings-list";
  root.append(listContainer);

  container.append(root);

  function renderCityRankings(selectedMun, onClearSelection) {
    header.innerHTML = "";

    const segmentedNav = documentRef.createElement("div");
    segmentedNav.className = "rankings-segmented-nav";

    const cityTabBtn = documentRef.createElement("button");
    cityTabBtn.type = "button";
    cityTabBtn.className = "rankings-segment-btn is-active";
    cityTabBtn.textContent = `📍 ${selectedMun.name}`;

    const stateTabBtn = documentRef.createElement("button");
    stateTabBtn.type = "button";
    stateTabBtn.className = "rankings-segment-btn";
    stateTabBtn.textContent = "🌐 Geral SP";
    if (typeof onClearSelection === "function") {
      stateTabBtn.addEventListener("click", () => {
        onClearSelection();
      });
    }
    segmentedNav.append(cityTabBtn, stateTabBtn);
    header.append(segmentedNav);

    const metaRow = documentRef.createElement("div");
    metaRow.className = "city-rankings-meta-row";

    const titleWrap = documentRef.createElement("div");
    const cityTitle = documentRef.createElement("h3");
    cityTitle.className = "election-rankings-title";
    cityTitle.textContent = selectedMun.name;

    const citySubtitle = documentRef.createElement("p");
    citySubtitle.className = "election-rankings-subtitle";
    const munValid = Number(selectedMun.validVotes || 0);
    citySubtitle.textContent = `${munValid.toLocaleString("pt-BR")} votos válidos apurados`;
    titleWrap.append(cityTitle, citySubtitle);

    const apuradoBadge = documentRef.createElement("span");
    apuradoBadge.className = "city-apurado-badge";
    apuradoBadge.textContent = "100% APURADO";

    metaRow.append(titleWrap, apuradoBadge);
    header.append(metaRow);

    const rawCandidates = selectedMun.candidates || [];
    const cityCandidates = [...rawCandidates].sort((a, b) => {
      const vA = Number(a.validVotes || a.votes || 0);
      const vB = Number(b.validVotes || b.votes || 0);
      return vB - vA;
    });

    if (cityCandidates.length === 0) {
      const emptyMsg = documentRef.createElement("div");
      emptyMsg.className = "election-rankings-empty";
      emptyMsg.textContent = "Sem votos apurados neste município.";
      listContainer.append(emptyMsg);
      return;
    }

    const partyColorFallbacks = {
      "22": "#1d4ed8",
      "10": "#1d4ed8",
      "13": "#dc2626",
      "30": "#ea580c",
      "44": "#9333ea",
      "55": "#059669",
      "111": "#2563eb",
      "222": "#1d4ed8",
      "400": "#f59e0b",
      "188": "#10b981",
      "50": "#64748b",
      "16": "#64748b",
    };

    for (let i = 0; i < cityCandidates.length; i += 1) {
      const cand = cityCandidates[i];
      const card = documentRef.createElement("div");
      card.className = "candidate-ranking-item";
      card.dataset.ballot = String(cand.ballotNumber);

      const isWinner = i === 0;
      if (isWinner) {
        card.classList.add("is-winner", "candidate-winner-card");

        const winnerBadge = documentRef.createElement("div");
        winnerBadge.className = "candidate-winner-badge";
        winnerBadge.textContent = "🏆 Vencedor no município";
        card.append(winnerBadge);
      }

      const topRow = documentRef.createElement("div");
      topRow.className = "candidate-ranking-top";

      const posBadge = documentRef.createElement("span");
      posBadge.className = "candidate-position-badge";
      posBadge.textContent = `${i + 1}º`;

      const nameInfo = documentRef.createElement("div");
      nameInfo.className = "candidate-name-info";

      const nameText = documentRef.createElement("span");
      nameText.className = "candidate-name";
      nameText.textContent = cand.name;

      const partyBallot = documentRef.createElement("span");
      partyBallot.className = "candidate-party-ballot";
      let partyLabel = cand.party;
      if (!partyLabel) {
        partyLabel = "Partido";
      }
      partyBallot.textContent = `${partyLabel} • Nº ${cand.ballotNumber}`;
      nameInfo.append(nameText, partyBallot);

      const votesInfo = documentRef.createElement("div");
      votesInfo.className = "candidate-votes-info";

      const candVotes = Number(cand.validVotes || cand.votes || 0);
      let share = Number(cand.sharePct);
      if (!Number.isFinite(share) && munValid > 0) {
        share = (candVotes * 100) / munValid;
      }
      if (!Number.isFinite(share)) {
        share = 0;
      }

      const sharePctText = documentRef.createElement("span");
      sharePctText.className = "candidate-share-pct";
      sharePctText.textContent = `${share.toFixed(2).replace(".", ",")}%`;

      const absVotes = documentRef.createElement("span");
      absVotes.className = "candidate-abs-votes";
      absVotes.textContent = `${candVotes.toLocaleString("pt-BR")} votos`;

      votesInfo.append(sharePctText, absVotes);
      topRow.append(posBadge, nameInfo, votesInfo);
      card.append(topRow);

      const progressTrack = documentRef.createElement("div");
      progressTrack.className = "candidate-progress-track";
      const progressBar = documentRef.createElement("div");
      progressBar.className = "candidate-progress-fill";
      const clampedWidth = Math.min(100, Math.max(0, share));
      progressBar.style.width = `${clampedWidth}%`;
      let fillColor = cand.color;
      if (!fillColor && cand.ballotNumber) {
        fillColor = partyColorFallbacks[String(cand.ballotNumber)];
      }
      if (fillColor) {
        progressBar.style.backgroundColor = fillColor;
      }
      progressTrack.append(progressBar);
      card.append(progressTrack);

      if (isWinner && typeof selectedMun.marginPp === "number" && selectedMun.marginPp > 0) {
        const marginStat = documentRef.createElement("div");
        marginStat.className = "candidate-margin-stat";
        marginStat.textContent = `Vantagem sobre o 2º: +${selectedMun.marginPp.toFixed(1).replace(".", ",")} p.p.`;
        card.append(marginStat);
      }

      listContainer.append(card);
    }

    // Demographics and participation mini-bento (Stitch design layout)
    const bento = documentRef.createElement("div");
    bento.className = "municipal-demographics-bento";

    const blankNullTotal = Number(selectedMun.blankVotes || 0) + Number(selectedMun.nullVotes || 0);
    const munTotalComputed = munValid + blankNullTotal;
    let blankNullPct = 0;
    if (munTotalComputed > 0) {
      blankNullPct = (blankNullTotal * 100) / munTotalComputed;
    }

    const bentoCard1 = documentRef.createElement("div");
    bentoCard1.className = "demographics-mini-card";
    const bentoLabel1 = documentRef.createElement("span");
    bentoLabel1.className = "demographics-card-label";
    bentoLabel1.textContent = "Brancos & Nulos";
    const bentoVal1 = documentRef.createElement("span");
    bentoVal1.className = "demographics-card-val";
    bentoVal1.textContent = `${blankNullPct.toFixed(1).replace(".", ",")}%`;
    const bentoSub1 = documentRef.createElement("span");
    bentoSub1.className = "demographics-card-sub";
    bentoSub1.textContent = `${blankNullTotal.toLocaleString("pt-BR")} votos`;
    bentoCard1.append(bentoLabel1, bentoVal1, bentoSub1);

    const bentoCard2 = documentRef.createElement("div");
    bentoCard2.className = "demographics-mini-card";
    const bentoLabel2 = documentRef.createElement("span");
    bentoLabel2.className = "demographics-card-label";
    bentoLabel2.textContent = "Participação";
    const bentoVal2 = documentRef.createElement("span");
    bentoVal2.className = "demographics-card-val";
    bentoVal2.textContent = "80,2%";
    const bentoSub2 = documentRef.createElement("span");
    bentoSub2.className = "demographics-card-sub";
    bentoSub2.textContent = `${munTotalComputed.toLocaleString("pt-BR")} comparecimento`;
    bentoCard2.append(bentoLabel2, bentoVal2, bentoSub2);

    bento.append(bentoCard1, bentoCard2);
    listContainer.append(bento);
  }

  function renderStateRankings(electionData) {
    header.innerHTML = "";

    const title = documentRef.createElement("h3");
    title.className = "election-rankings-title";
    title.textContent = "Comparativo de Candidatos";

    const subtitle = documentRef.createElement("p");
    subtitle.className = "election-rankings-subtitle";
    subtitle.textContent = "Votação no Estado e cidades de maior relevância";

    header.append(title, subtitle);

    const rankings = buildElectionCandidateRankings(electionData);
    const candidates = rankings.candidates || [];

    if (candidates.length === 0) {
      const emptyMsg = documentRef.createElement("div");
      emptyMsg.className = "election-rankings-empty";
      emptyMsg.textContent = "Aguardando totalização de votos...";
      listContainer.append(emptyMsg);
      return;
    }

    for (let i = 0; i < candidates.length; i += 1) {
      const cand = candidates[i];
      const card = documentRef.createElement("div");
      card.className = "candidate-ranking-item";
      card.dataset.ballot = String(cand.ballotNumber);

      const topRow = documentRef.createElement("div");
      topRow.className = "candidate-ranking-top";

      const posBadge = documentRef.createElement("span");
      posBadge.className = "candidate-position-badge";
      posBadge.textContent = `${i + 1}º`;

      const nameInfo = documentRef.createElement("div");
      nameInfo.className = "candidate-name-info";

      const nameText = documentRef.createElement("span");
      nameText.className = "candidate-name";
      nameText.textContent = cand.name;

      const partyBallot = documentRef.createElement("span");
      partyBallot.className = "candidate-party-ballot";
      let partyLabel = cand.party;
      if (!partyLabel) {
        partyLabel = "Partido";
      }
      partyBallot.textContent = `${partyLabel} • Nº ${cand.ballotNumber}`;

      nameInfo.append(nameText, partyBallot);

      const votesInfo = documentRef.createElement("div");
      votesInfo.className = "candidate-votes-info";

      const sharePctText = documentRef.createElement("span");
      sharePctText.className = "candidate-share-pct";
      sharePctText.textContent = `${cand.sharePct.toFixed(2).replace(".", ",")}%`;

      const absVotes = documentRef.createElement("span");
      absVotes.className = "candidate-abs-votes";
      absVotes.textContent = `${cand.validVotes.toLocaleString("pt-BR")} votos`;

      votesInfo.append(sharePctText, absVotes);
      topRow.append(posBadge, nameInfo, votesInfo);
      card.append(topRow);

      const statsRow = documentRef.createElement("div");
      statsRow.className = "candidate-stats-row";

      const ledStat = documentRef.createElement("span");
      ledStat.className = "candidate-stat-pill";
      let ledLabel = "cidades lideradas";
      if (cand.ledCount === 1) {
        ledLabel = "cidade liderada";
      }
      ledStat.textContent = `🚩 ${cand.ledCount} ${ledLabel}`;
      statsRow.append(ledStat);

      card.append(statsRow);

      const topCitiesSection = documentRef.createElement("div");
      topCitiesSection.className = "candidate-top-cities";

      const topCitiesTitle = documentRef.createElement("span");
      topCitiesTitle.className = "candidate-top-cities-title";
      topCitiesTitle.textContent = "Municípios de maior relevância:";
      topCitiesSection.append(topCitiesTitle);

      const citiesGrid = documentRef.createElement("div");
      citiesGrid.className = "candidate-cities-grid";

      const topByVotes = (cand.topMunicipalitiesByVotes || []).slice(0, 3);
      if (topByVotes.length > 0) {
        const colVotes = documentRef.createElement("div");
        colVotes.className = "cities-col";
        const colTitle = documentRef.createElement("span");
        colTitle.className = "cities-col-title";
        colTitle.textContent = "Mais votados (absoluto):";
        colVotes.append(colTitle);

        for (const item of topByVotes) {
          const cityItem = documentRef.createElement("div");
          cityItem.className = "city-rank-item";
          cityItem.textContent = `${item.name}: ${item.votes.toLocaleString("pt-BR")} (${item.sharePct.toFixed(1).replace(".", ",")}%)`;
          colVotes.append(cityItem);
        }
        citiesGrid.append(colVotes);
      }

      const topByShare = (cand.topMunicipalitiesByShare || []).slice(0, 3);
      if (topByShare.length > 0) {
        const colShare = documentRef.createElement("div");
        colShare.className = "cities-col";
        const colTitle = documentRef.createElement("span");
        colTitle.className = "cities-col-title";
        colTitle.textContent = "Maior percentual:";
        colShare.append(colTitle);

        for (const item of topByShare) {
          const cityItem = documentRef.createElement("div");
          cityItem.className = "city-rank-item";
          cityItem.textContent = `${item.name}: ${item.sharePct.toFixed(1).replace(".", ",")}% (${item.votes.toLocaleString("pt-BR")})`;
          colShare.append(cityItem);
        }
        citiesGrid.append(colShare);
      }

      topCitiesSection.append(citiesGrid);
      card.append(topCitiesSection);
      listContainer.append(card);
    }
  }

  function renderTwoCitiesComparison(munA, munB, onClearSelection) {
    header.innerHTML = "";

    const headerRow = documentRef.createElement("div");
    headerRow.className = "candidate-rankings-header-row";

    const badge = documentRef.createElement("span");
    badge.className = "city-badge-tag";
    badge.textContent = "⚖️ Comparativo de 2 Cidades";
    headerRow.append(badge);

    if (typeof onClearSelection === "function") {
      const backBtn = documentRef.createElement("button");
      backBtn.type = "button";
      backBtn.className = "candidate-rankings-back-btn";
      backBtn.textContent = "✕ Ver Estado";
      backBtn.addEventListener("click", () => {
        onClearSelection();
      });
      headerRow.append(backBtn);
    }
    header.append(headerRow);

    const title = documentRef.createElement("h3");
    title.className = "election-rankings-title";
    title.textContent = `${munA.name} vs ${munB.name}`;

    const subtitle = documentRef.createElement("p");
    subtitle.className = "election-rankings-subtitle";
    subtitle.textContent = "Comparação direta de votos nominais e percentuais";
    header.append(title, subtitle);

    // Summary cards for Mun A and Mun B
    const summaryGrid = documentRef.createElement("div");
    summaryGrid.className = "compare-cities-summary-grid";

    const createCityCard = (mun) => {
      const card = documentRef.createElement("div");
      card.className = "compare-city-summary-card";
      const name = documentRef.createElement("span");
      name.className = "compare-city-card-name";
      name.textContent = mun.name;

      const winner = documentRef.createElement("span");
      winner.className = "compare-city-card-winner";
      let leaderText = "Sem votos";
      if (mun.leader && mun.leader.name) {
        leaderText = `🏆 ${mun.leader.name} (${Number(mun.leader.sharePct ?? 0).toFixed(1).replace(".", ",")}%)`;
      }
      winner.textContent = leaderText;

      const votes = documentRef.createElement("span");
      votes.className = "compare-city-card-votes";
      votes.textContent = `${Number(mun.validVotes ?? 0).toLocaleString("pt-BR")} válidos`;

      card.append(name, winner, votes);
      return card;
    };

    summaryGrid.append(createCityCard(munA), createCityCard(munB));
    listContainer.append(summaryGrid);

    // Candidate comparison rows
    const candsA = munA.candidates || [];
    const candMapB = new Map();
    for (const c of (munB.candidates || [])) {
      candMapB.set(String(c.ballotNumber), c);
    }

    const partyColorFallbacks = {
      "22": "#1d4ed8",
      "10": "#1d4ed8",
      "13": "#dc2626",
      "30": "#ea580c",
      "44": "#9333ea",
      "55": "#059669",
      "111": "#2563eb",
      "222": "#1d4ed8",
      "400": "#f59e0b",
      "188": "#10b981",
      "50": "#64748b",
      "16": "#64748b",
    };

    for (let i = 0; i < candsA.length; i += 1) {
      const cA = candsA[i];
      const ballot = String(cA.ballotNumber);
      const cB = candMapB.get(ballot) || { name: cA.name, validVotes: 0, sharePct: 0 };

      const item = documentRef.createElement("div");
      item.className = "compare-candidate-row";

      const nameRow = documentRef.createElement("div");
      nameRow.className = "compare-candidate-name-row";

      const candName = documentRef.createElement("span");
      candName.className = "candidate-name";
      candName.textContent = cA.name;

      const partyTag = documentRef.createElement("span");
      partyTag.className = "candidate-party-ballot";
      let party = cA.party;
      if (!party) {
        party = "Partido";
      }
      partyTag.textContent = `${party} • Nº ${ballot}`;
      nameRow.append(candName, partyTag);
      item.append(nameRow);

      const dualBars = documentRef.createElement("div");
      dualBars.className = "compare-dual-bars";

      const makeBarRow = (cityName, cData, validTotal) => {
        const row = documentRef.createElement("div");
        row.className = "compare-bar-subrow";

        const label = documentRef.createElement("span");
        label.className = "compare-bar-city-label";
        label.textContent = cityName;

        let pct = Number(cData.sharePct ?? 0);
        if (!pct && validTotal > 0) {
          pct = (Number(cData.validVotes ?? 0) * 100) / validTotal;
        }

        const track = documentRef.createElement("div");
        track.className = "candidate-progress-track";
        const fill = documentRef.createElement("div");
        fill.className = "candidate-progress-fill";
        fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        let color = cData.color || partyColorFallbacks[ballot];
        if (color) {
          fill.style.backgroundColor = color;
        }
        track.append(fill);

        const val = documentRef.createElement("span");
        val.className = "compare-bar-val";
        val.textContent = `${pct.toFixed(1).replace(".", ",")}% (${Number(cData.validVotes ?? 0).toLocaleString("pt-BR")})`;

        row.append(label, track, val);
        return row;
      };

      dualBars.append(
        makeBarRow(munA.name, cA, munA.validVotes),
        makeBarRow(munB.name, cB, munB.validVotes),
      );
      item.append(dualBars);
      listContainer.append(item);
    }
  }

  function renderMultiCitiesView(muns, onClearSelection) {
    header.innerHTML = "";

    const headerRow = documentRef.createElement("div");
    headerRow.className = "candidate-rankings-header-row";

    const badge = documentRef.createElement("span");
    badge.className = "city-badge-tag";
    badge.textContent = `📍 ${muns.length} Cidades Selecionadas`;
    headerRow.append(badge);

    if (typeof onClearSelection === "function") {
      const backBtn = documentRef.createElement("button");
      backBtn.type = "button";
      backBtn.className = "candidate-rankings-back-btn";
      backBtn.textContent = "✕ Ver Estado";
      backBtn.addEventListener("click", () => {
        onClearSelection();
      });
      headerRow.append(backBtn);
    }
    header.append(headerRow);

    const title = documentRef.createElement("h3");
    title.className = "election-rankings-title";
    title.textContent = "Cidades Selecionadas";

    let totalValidSum = 0;
    for (const m of muns) {
      totalValidSum += Number(m.validVotes ?? 0);
    }

    const subtitle = documentRef.createElement("p");
    subtitle.className = "election-rankings-subtitle";
    subtitle.textContent = `Total agrupado: ${totalValidSum.toLocaleString("pt-BR")} votos válidos`;
    header.append(title, subtitle);

    for (let i = 0; i < muns.length; i += 1) {
      const m = muns[i];
      const card = documentRef.createElement("div");
      card.className = "candidate-ranking-item";

      const top = documentRef.createElement("div");
      top.className = "candidate-ranking-top";

      const nameInfo = documentRef.createElement("div");
      nameInfo.className = "candidate-name-info";

      const name = documentRef.createElement("span");
      name.className = "candidate-name";
      name.textContent = `${i + 1}. ${m.name}`;

      const winner = documentRef.createElement("span");
      winner.className = "candidate-party-ballot";
      let leaderTxt = "Sem votos";
      if (m.leader && m.leader.name) {
        leaderTxt = `🏆 ${m.leader.name} (${Number(m.leader.sharePct ?? 0).toFixed(1).replace(".", ",")}%)`;
      }
      winner.textContent = leaderTxt;
      nameInfo.append(name, winner);

      const votesInfo = documentRef.createElement("div");
      votesInfo.className = "candidate-votes-info";
      const votes = documentRef.createElement("span");
      votes.className = "candidate-share-pct";
      votes.textContent = `${Number(m.validVotes ?? 0).toLocaleString("pt-BR")}`;
      const lbl = documentRef.createElement("span");
      lbl.className = "candidate-abs-votes";
      lbl.textContent = "votos válidos";
      votesInfo.append(votes, lbl);

      top.append(nameInfo, votesInfo);
      card.append(top);
      listContainer.append(card);
    }
  }

  function update(electionData) {
    listContainer.innerHTML = "";
    if (!electionData) {
      return;
    }

    const selectedMuns = electionData.selectedMunicipalities || [];
    if (selectedMuns.length > 1) {
      if (selectedMuns.length === 2) {
        renderTwoCitiesComparison(selectedMuns[0], selectedMuns[1], electionData.onClearSelection);
        return;
      }
      renderMultiCitiesView(selectedMuns, electionData.onClearSelection);
      return;
    }

    const selectedMun = electionData.selectedMunicipality;
    if (selectedMun) {
      renderCityRankings(selectedMun, electionData.onClearSelection);
      return;
    }

    renderStateRankings(electionData);
  }

  function destroy() {
    root.remove();
  }

  return {
    element: root,
    update,
    destroy,
  };
}
