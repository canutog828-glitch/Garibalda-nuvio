(function (globalThis, window, self) {
  'use strict';

  const defaultHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'DNT': '1'
  };

  function safeFetch(url, options = {}) {
    const headers = Object.assign({}, defaultHeaders, options.headers || {});
    const method = options.method || 'GET';
    const body = options.body || null;

    return fetch(url, { method, headers, body })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Erro HTTP: ${response.status} em ${url}`);
        }
        return response;
      });
  }

  function fshdMovie(tmdbId) {
    const pageUrl = `https://fshd.link/filme/${tmdbId}`;
    const langName = { '1': 'Dublado', '2': 'Legendado' };

    return safeFetch(pageUrl)
      .then(r => r.text())
      .then(html => {
        const c = html.match(/\/movies\/backdrops\/[^\/]+\/(\d+)\.\w+/);
        const cid = c ? c[1] : null;
        if (!cid) return [];

        const re = /class="server-selector"\s+data-id="(\d+)"\s+data-lang="(\d+)"[\s\S]*?<b>([^<]+)<\/b>/g;
        let m;
        let jobs = [];

        while ((m = re.exec(html)) !== null) {
          if (/fsplay/i.test(m[3])) {
            jobs.push(queryServerFshd(cid, m[1], m[2], pageUrl, langName));
          }
        }

        if (!jobs.length) return [];
        return Promise.all(jobs).then(all => {
          let out = [];
          all.forEach(a => { out = out.concat(a); });
          return out.sort((a, b) => (b.quality || 0) - (a.quality || 0));
        });
      })
      .catch(() => []);
  }

  function queryServerFshd(cid, vid, lang, pageUrl, langName) {
    const types = ['1', '2'];
    
    function attempt(i) {
      if (i >= types.length) return Promise.resolve([]);
      
      // Correção: Converte o objeto para URLSearchParams (form-urlencoded correto)
      const bodyData = new URLSearchParams({
        'content_info': cid,
        'content_type': types[i],
        'video_id': vid
      }).toString();

      return safeFetch('https://fshd.link/api/source', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 
          'Referer': pageUrl 
        },
        body: bodyData
      })
      .then(r => r.text())
      .then(t => {
        const m = t.match(/["']video_url["']\s*:\s*["'](.*?)["']/);
        const vurl = m ? m[1].replace(/\\/g, '') : null;
        if (!vurl) return attempt(i + 1);

        return safeFetch(vurl, { headers: { 'Referer': pageUrl } })
          .then(r => r.text())
          .then(h => {
            const l = h.match(/window\.location\.href\s*=\s*"([^"]+)"/);
            if (!l) return attempt(i + 1);

            return resolveFinalStreams(l[1], vurl, langName[lang] || 'Dublado');
          });
      })
      .catch(() => attempt(i + 1));
    }

    return attempt(0);
  }

  function resolveFinalStreams(targetUrl, refererUrl, groupName) {
    const headers = {
      'Accept': '*/*',
      'Referer': refererUrl,
      'User-Agent': defaultHeaders['User-Agent']
    };

    return safeFetch(targetUrl, { headers })
      .then(r => r.json())
      .catch(() => [])
      .then(list => {
        if (!Array.isArray(list)) return [];
        return list.map(x => ({
          'name': `FSHD ${groupName} ${x.quality || 1080}p`,
          'title': 'Servidor: Fsplay',
          'url': x.url,
          'quality': x.quality || 1080,
          'group': groupName,
          'provider': 'fshd',
          'headers': x.headers || headers
        }));
      });
  }

  function getStreams(tmdbId, type, season, episode) {
    if (type === 'movie') {
      return fshdMovie(tmdbId);
    }
    return Promise.resolve([]);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 'getStreams': getStreams };
  } else {
    globalThis.getStreams = getStreams;
  }

})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {});
