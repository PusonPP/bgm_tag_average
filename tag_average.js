// ==UserScript==
// @name         Bangumi用户收藏页面显示每个标签的平均评分
// @namespace    https://github.com/PusonPP/bgm_tag_average
// @version      1.0.0
// @description  在Bangumi用户收藏页面中，为每个标签显示该标签下条目的平均评分
// @author       Puson_PP
// @match        https://bangumi.tv/*/list/*
// @match        https://bgm.tv/*/list/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const waitForElements = (selector, timeout = 8000) => {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          resolve(elements);
        } else if (Date.now() - start > timeout) {
          reject(new Error("等待标签列表超时"));
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });
  };

  const pathMatch = location.pathname.match(/^\/(anime|book|game|music|real)\/list\/([^/]+)\/(collect|do|wish|on_hold|dropped)/);
  if (!pathMatch) {
    console.log("[组件] 当前页面不匹配收藏页面，跳过执行");
    return;
  }

  const category = pathMatch[1];
  const username = pathMatch[2];
  const subjectTypeMap = {
    anime: 2,
    book: 1,
    music: 3,
    game: 4,
    real: 6
  };
  const subjectType = subjectTypeMap[category] || 2;

  async function fetchAllCollections() {
    const limit = 100;
    let offset = 0;
    let allItems = [];

    while (true) {
      const url = `https://api.bgm.tv/v0/users/${username}/collections?subject_type=${subjectType}&type=2&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        console.error('[组件] 数据请求失败:', response.status);
        break;
      }

      const result = await response.json();
      if (!result.data || result.data.length === 0) break;

      allItems = allItems.concat(result.data);
      if (result.data.length < limit) break;
      offset += limit;
    }

    return allItems;
  }

  function computeAverageScores(items) {
    const tagScores = {};
    for (const item of items) {
      const score = item.rate;
      if (!score || score === 0 || !item.tags) continue;
      for (const tag of item.tags) {
        if (!tagScores[tag]) tagScores[tag] = [];
        tagScores[tag].push(score);
      }
    }

    const tagAvg = {};
    for (const tag in tagScores) {
      const scores = tagScores[tag];
      const avg = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
      tagAvg[tag] = avg;
    }

    return tagAvg;
  }

  async function main() {
    const items = await fetchAllCollections();
    const tagAvgScore = computeAverageScores(items);

    try {
      const anchors = await waitForElements('#userTagList li a');

      anchors.forEach(anchor => {
        const rawText = anchor.innerText.trim();
        const tagName = rawText.replace(/^\d+/, '').trim();

        const avg = tagAvgScore[tagName];
        if (!avg) return;

        const span = document.createElement('span');
        span.className = 'tag-score';
        span.style.color = '#888';
        span.style.fontSize = '90%';
        span.style.marginLeft = '6px';
        span.textContent = `（平均：${avg}）`;

        anchor.insertAdjacentElement('afterend', span);
      });
    } catch (err) {
      console.error('[组件] 插入评分失败:', err);
    }
  }

  main();
})();
