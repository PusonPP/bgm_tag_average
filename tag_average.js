// ==UserScript==
// @name         Bangumi用户收藏页面显示每个标签的平均评分
// @namespace    https://github.com/PusonPP/bgm_tag_average
// @version      1.1.1
// @description  显示Bangumi用户收藏标签的平均评分，带本地缓存与刷新按钮
// @author       Puson_PP
// @match        https://bangumi.tv/*/list/*
// @match        https://bgm.tv/*/list/*
// @match        https://chii.in/*/list/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const CACHE_VALID_MS = 24 * 60 * 60 * 1000;
  const pathMatch = location.pathname.match(/^\/(anime|book|game|music|real)\/list\/([^/]+)\/(collect|do|wish|on_hold|dropped)/);
  if (!pathMatch) return;

  const category = pathMatch[1];
  const username = pathMatch[2];
  const cacheKey = `tagAvgCache_${username}_${category}`;
  const subjectTypeMap = { anime: 2, book: 1, music: 3, game: 4, real: 6 };
  const subjectType = subjectTypeMap[category] || 2;

  async function fetchAllCollections() {
    const limit = 100;
    let offset = 0;
    let allItems = [];
    while (true) {
      const url = `https://api.bgm.tv/v0/users/${username}/collections?subject_type=${subjectType}&type=2&limit=${limit}&offset=${offset}`;
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!response.ok) break;
      const result = await response.json();
      if (!result.data || result.data.length === 0) break;
      allItems = allItems.concat(result.data);
      if (result.data.length < limit) break;
      offset += limit;
    }
    return allItems;
  }

  function normalizeTag(tag) {
      return tag.trim().toLowerCase().replace(/\s+/g, '');
  }

  function getCleanTagName(anchor) {
      const smallElem = anchor.querySelector('small');
      if (smallElem) {
          return anchor.innerText.replace(smallElem.innerText, '').trim();
      }
      return anchor.innerText.trim();
  }

  function computeAverageScores(items) {
    const tagScores = {};
    for (const item of items) {
      const score = item.rate;
      if (!score || score === 0 || !item.tags) continue;
      for (const tag of item.tags) {
          const norm = normalizeTag(tag);
          if (!tagScores[norm]) tagScores[norm] = [];
          tagScores[norm].push(score);
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

  function insertScores(tagAvg) {
    const anchors = document.querySelectorAll('#userTagList li a');
    anchors.forEach(anchor => {
      const tagName = normalizeTag(getCleanTagName(anchor));
      const avg = tagAvg[tagName];
      if (!avg) return;

      if (!anchor.nextElementSibling || !anchor.nextElementSibling.classList.contains('tag-score')) {
        const span = document.createElement('span');
        span.className = 'tag-score';
        span.style.color = '#888';
        span.style.fontSize = '90%';
        span.style.marginLeft = '6px';
        span.textContent = `（平均：${avg}）`;
        anchor.insertAdjacentElement('afterend', span);
      }
    });
  }

  function setupObserver(tagAvg) {
    const tagList = document.getElementById('userTagList');
    if (!tagList) return;

    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1 || node.tagName.toLowerCase() !== 'li') return;
          const anchor = node.querySelector('a');
          if (!anchor) return;

          const smallElem = anchor.querySelector('small');
          const tagName = normalizeTag(getCleanTagName(anchor));
          const avg = tagAvg[tagName];
          if (!avg) return;
          if (!anchor.nextElementSibling || !anchor.nextElementSibling.classList.contains('tag-score')) {
            const span = document.createElement('span');
            span.className = 'tag-score';
            span.style.color = '#888';
            span.style.fontSize = '90%';
            span.style.marginLeft = '6px';
            span.textContent = `（平均：${avg}）`;
            anchor.insertAdjacentElement('afterend', span);
          }
        });
      });
    });

    observer.observe(tagList, { childList: true });
  }

  function insertRefreshAndSortButtons(tagAvg, onRefreshClick) {
      const container = document.querySelector('#userTagList');
      if (!container || document.getElementById('tag-button-wrapper')) return;

      const wrapper = document.createElement('div');
      wrapper.id = 'tag-button-wrapper';
      wrapper.style.marginBottom = '8px';

      function styleButton(btn) {
          btn.style.display = 'inline-block';
          btn.style.marginRight = '12px';
          btn.style.border = 'none';
          btn.style.background = 'none';
          btn.style.padding = '4px 0';
          btn.style.color = '#02a3fb';
          btn.style.fontSize = '14px';
          btn.style.fontWeight = 'bold';
          btn.style.cursor = 'pointer';
          btn.addEventListener('mouseenter', () => btn.style.color = '#f09199');
          btn.addEventListener('mouseleave', () => btn.style.color = '#00f');
      }

      const refreshBtn = document.createElement('button');
      refreshBtn.textContent = '平均分刷新';
      refreshBtn.id = 'tag-refresh-btn';
      styleButton(refreshBtn);
      refreshBtn.onclick = onRefreshClick;

      const sortBtn = document.createElement('button');
      sortBtn.textContent = '按评分排序';
      sortBtn.id = 'tag-sort-btn';
      styleButton(sortBtn);

      let sorted = false;
      const tagList = document.getElementById('userTagList');
      const originalOrder = Array.from(tagList.children);

      sortBtn.onclick = () => {
          const items = Array.from(tagList.children);
          if (!sorted) {
              items.sort((a, b) => {
                  const getScore = li => {
                      const scoreSpan = li.querySelector('.tag-score');
                      if (!scoreSpan) return -Infinity;
                      const match = scoreSpan.textContent.match(/平均：([\d.]+)/);
                      return match ? parseFloat(match[1]) : -Infinity;
                  };
                  return getScore(b) - getScore(a);
              });
              sortBtn.textContent = '按数量排序';
              sorted = true;
          } else {
              items.length = 0;
              items.push(...originalOrder);
              sortBtn.textContent = '按评分排序';
              sorted = false;
          }

          tagList.innerHTML = '';
          items.forEach(item => tagList.appendChild(item));
      };

      wrapper.appendChild(refreshBtn);
      wrapper.appendChild(sortBtn);
      container.parentElement.insertBefore(wrapper, container);
  }


  async function run(useCache = true) {
    let tagAvg;
    const cached = localStorage.getItem(cacheKey);
    if (useCache && cached) {
      try {
        const parsed = JSON.parse(cached);
        const now = Date.now();
        if (now - parsed.updatedAt < CACHE_VALID_MS) {
          console.log('使用缓存数据');
          tagAvg = parsed.tagAvg;
        }
      } catch (e) {
        console.warn('缓存读取失败，将重新请求');
      }
    }

    if (!tagAvg) {
      console.log('正在请求 Bangumi API');
      const items = await fetchAllCollections();
      tagAvg = computeAverageScores(items);
      localStorage.setItem(cacheKey, JSON.stringify({
        updatedAt: Date.now(),
        tagAvg: tagAvg
      }));
    }

    insertScores(tagAvg);
    setupObserver(tagAvg);
    insertRefreshAndSortButtons(tagAvg, () => run(false));
  }

  run();
})();
