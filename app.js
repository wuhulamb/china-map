// ===== Initialize Map =====
var map = L.map('map', {
  center: [35, 105],
  zoom: 4,
  minZoom: 3,
  maxZoom: 10,
  zoomControl: true,
  attributionControl: true
});

// No tile layer - just show GeoJSON data on empty背景

// ===== Parse TopoJSON → GeoJSON =====
var geoData = { type: 'FeatureCollection', features: [] };
for (var key in CHINA_CITIES.objects) {
  var fc = topojson.feature(CHINA_CITIES, CHINA_CITIES.objects[key]);
  geoData.features = geoData.features.concat(fc.features);
}

// Build name lookups: full name → feature, and short name → feature
var cityMap = {};
var shortNameMap = {};
var boundaryFeatures = [];

// Common suffixes to strip for short name matching
var SUFFIXES = ['蒙古族藏族自治州', '土家族苗族自治州', '哈尼族彝族自治州', '布依族苗族自治州', '苗族侗族自治州', '柯尔克孜自治州', '黎族苗族自治县', '壮族苗族自治州', '回族自治州', '藏族自治州', '彝族自治州', '白族自治州', '傣族自治州', '朝鲜族自治州', '各族自治县', '自治州', '地区', '市', '区', '县', '盟', '省', '场', '州'];

geoData.features.forEach(function(f) {
  var gb = f.properties.gb || '';
  var name = f.properties.name || '';
  var isBoundary = name === '境界线' || (gb.length === 4);
  if (isBoundary) {
    boundaryFeatures.push(f);
  } else {
    var fullName = f.properties.name || '';
    cityMap[fullName.toLowerCase()] = f;

    // Compute short name by stripping suffixes
    var shortName = fullName;
    for (var i = 0; i < SUFFIXES.length; i++) {
      if (shortName.endsWith(SUFFIXES[i])) {
        shortName = shortName.slice(0, -SUFFIXES[i].length);
        break;
      }
    }
    // Only register short name if it differs from full name
    if (shortName !== fullName) {
      shortNameMap[shortName.toLowerCase()] = f;
    }
  }
});

var cityCount = Object.keys(cityMap).length;

// Set initial detail panel
document.getElementById('detail-panel').innerHTML =
  '<div class="placeholder">' +
  '<div class="icon">🗺️</div>' +
  '<div>搜索或点击地图上的城市查看详情</div></div>';

var geoLayer = L.geoJSON(geoData, {
  style: function(feature) {
    var isBoundary = feature.properties.gb && feature.properties.gb.length === 4;
    return {
      color: isBoundary ? '#666' : '#e67e22',
      weight: isBoundary ? 2 : 1.2,
      opacity: 0.8,
      fillColor: isBoundary ? 'transparent' : '#f39c12',
      fillOpacity: 0.25
    };
  },
  onEachFeature: function(feature, layer) {
    var name = feature.properties.name || '未知';
    var gb = feature.properties.gb || '';
    var isBoundary = gb && gb.length === 4;
    var label = isBoundary ? name + ' (边界)' : name;

    if (!L.Browser.mobile) {
      layer.bindTooltip(label, {
        sticky: true,
        direction: 'top',
        offset: [0, -8]
      });
    }

    layer.on('click', function() {
      if (!gameActive) {
        showDetail(feature);
        highlightFeature(layer);
      }
    });

    feature._layer = layer;
  }
}).addTo(map);

geoLayer.getBounds().isValid() && map.fitBounds(geoLayer.getBounds(), { padding: [30, 30] });

// ===== Highlight Feature =====
var highlightedLayer = null;

function highlightFeature(layer) {
  if (highlightedLayer && highlightedLayer !== layer) {
    geoLayer.resetStyle(highlightedLayer);
  }
  highlightedLayer = layer;
  layer.setStyle({
    color: '#2980b9',
    weight: 2.5,
    fillColor: '#3498db',
    fillOpacity: 0.4
  });
}

// ===== Search =====
var searchInput = document.getElementById('search-input');
var searchResults = document.getElementById('search-results');
var allFeatures = geoData.features;

searchInput.addEventListener('input', function() {
  var q = this.value.trim().toLowerCase();
  searchResults.style.display = q ? 'block' : 'none';
  searchResults.innerHTML = '';
  if (!q) return;

  var matches = [];
  allFeatures.forEach(function(f) {
    var name = (f.properties.name || '').toLowerCase();
    if (name.indexOf(q) !== -1) {
      matches.push(f);
    }
  });

  var frag = document.createDocumentFragment();
  matches.slice(0, 15).forEach(function(f) {
    var div = document.createElement('div');
    var name = f.properties.name || '未知';
    var gb = f.properties.gb || '';
    div.innerHTML = name + '<span class="gb-code">' + gb + '</span>';
    div.dataset.idx = '';
    div.addEventListener('click', function() {
      selectSearchResult(f);
    });
    frag.appendChild(div);
  });
  searchResults.appendChild(frag);
  searchResults._items = matches.slice(0, 15);
  searchResults._selectedIdx = -1;
});

searchInput.addEventListener('keydown', function(e) {
  var items = searchResults._items;
  if (!items || items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var idx = searchResults._selectedIdx;
    var prev = searchResults.children[idx];
    if (prev) prev.classList.remove('selected');
    idx = (idx + 1) % items.length;
    searchResults._selectedIdx = idx;
    var cur = searchResults.children[idx];
    if (cur) cur.classList.add('selected');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var idx = searchResults._selectedIdx;
    var prev = searchResults.children[idx];
    if (prev) prev.classList.remove('selected');
    idx = idx <= 0 ? items.length - 1 : idx - 1;
    searchResults._selectedIdx = idx;
    var cur = searchResults.children[idx];
    if (cur) cur.classList.add('selected');
  } else if (e.key === 'Enter') {
    var idx = searchResults._selectedIdx;
    if (idx < 0 || idx >= items.length) idx = 0;
    if (items.length > 0) {
      e.preventDefault();
      selectSearchResult(items[idx]);
    }
  }
});

searchInput.addEventListener('blur', function() {
  setTimeout(function() { searchResults.style.display = 'none'; }, 200);
});
searchInput.addEventListener('focus', function() {
  if (this.value.trim()) { searchResults.style.display = 'block'; }
});

// ===== Select Search Result =====
function selectSearchResult(f) {
  searchInput.value = f.properties.name || '';
  searchResults.style.display = 'none';
  searchResults._items = null;
  showDetail(f);
  var layer = f._layer;
  if (layer) {
    highlightFeature(layer);
    map.fitBounds(layer.getBounds(), { padding: [50, 50], maxZoom: 8 });
  }
}

// ===== Detail Panel =====
function showDetail(feature) {
  var panel = document.getElementById('detail-panel');
  var name = feature.properties.name || '未知';
  var gb = feature.properties.gb || '';
  // Remove the "156" prefix from gb code, keep only the last 6 digits
  var displayGgb = gb;
  if (displayGgb && displayGgb.length > 6 && displayGgb.indexOf('156') == 0) {
    displayGgb = displayGgb.substring(3);
  }

  panel.innerHTML = '<div class="detail-card">' +
    '<h2>' + name + '</h2>' +
    '<div class="gb">' + displayGgb + '</div>' +
        '</div>';
}

// ===== Game Mode =====
var gameActive = false;
var guessedNames = {};  // lowercase name → true
var gameScore = 0;
var gameInput = document.getElementById('game-input');
var gameBox = document.getElementById('game-box');
var gameStats = document.getElementById('game-stats');
var gameScoreEl = document.getElementById('game-score');
var gameLastCity = document.getElementById('game-last-city');
var headerSubtitle = document.getElementById('header-subtitle');
var btnGame = document.getElementById('btn-game');

function toggleGame() {
  if (gameActive) {
    endGame();
  } else {
    startGame();
  }
}

function startGame() {
  gameActive = true;
  guessedNames = {};
  gameScore = 0;
  highlightedLayer = null;

  // Clear search and toggle UI
  searchInput.value = '';
  searchResults.innerHTML = '';
  searchResults.style.display = 'none';
  document.getElementById('search-box').style.display = 'none';
  gameBox.style.display = 'block';
  gameStats.style.display = 'flex';
  headerSubtitle.textContent = '游戏模式 · 猜城市名点亮地图';
  btnGame.textContent = '结束游戏';
  btnGame.className = 'btn btn-end';

  // Show game city list, hide detail panel
  document.getElementById('detail-panel').style.display = 'none';
  var cityList = document.getElementById('game-city-list');
  cityList.style.display = 'block';
  cityList.innerHTML = '';

  // Disable tooltips
  geoLayer.eachLayer(function(layer) {
    layer.unbindTooltip();
  });

  // Reset all city styles to default
  geoLayer.eachLayer(function(layer) {
    geoLayer.resetStyle(layer);
  });

  // Focus game input
  gameInput.value = '';
  gameInput.className = '';
  gameInput.focus();
}

function endGame() {
  gameActive = false;
  highlightedLayer = null;

  // Reset all city styles to default
  geoLayer.eachLayer(function(layer) {
    geoLayer.resetStyle(layer);
  });

  // Toggle UI
  document.getElementById('search-box').style.display = 'block';
  gameBox.style.display = 'none';
  gameStats.style.display = 'none';
  document.getElementById('detail-panel').style.display = 'block';
  document.getElementById('detail-panel').innerHTML =
    '<div class="placeholder" style="display:block">' +
    '<div class="icon">🗺️</div>' +
    '<div>搜索或点击地图上的城市查看详情</div></div>';
  document.getElementById('game-city-list').style.display = 'none';
  headerSubtitle.textContent = '共 ' + cityCount + ' 个城市 · 点击或搜索';
  btnGame.textContent = '开始游戏';
  btnGame.className = 'btn btn-start';

  // Re-enable tooltips (desktop only)
  geoLayer.eachLayer(function(layer) {
    if (L.Browser.mobile) return;
    var feat = layer.feature;
    var name = feat.properties.name || '未知';
    var gb = feat.properties.gb || '';
    var isBoundary = gb && gb.length === 4;
    var label = isBoundary ? name + ' (边界)' : name;
    layer.bindTooltip(label, { sticky: true, direction: 'top', offset: [0, -8] });
  });

  // Show result
  var msg = '游戏结束！你点亮了 ' + gameScore + ' / ' + cityCount + ' 个城市';
  showToast(msg, 3000);
}

// Game input: auto-match on each keystroke
gameInput.addEventListener('input', function() {
  if (!gameActive) return;

  var raw = this.value.trim();
  if (!raw) return;

  var key = raw.toLowerCase();
  var feat = cityMap[key] || shortNameMap[key];

  if (feat) {
    // Use canonical full name for dedup (handles short name + full name inputs)
    var canonKey = feat.properties.name;
    if (!guessedNames[canonKey]) {
      // New city!
      guessedNames[canonKey] = true;
      gameScore++;
      gameScoreEl.textContent = gameScore;
      // Append to city list
      var item = document.createElement('div');
      item.className = 'city-item';
      item.innerHTML = '<span class="num">' + gameScore + '.</span> ' + feat.properties.name;
      document.getElementById('game-city-list').appendChild(item);

      var layer = feat._layer;
      if (layer) {
        layer.setStyle({
          color: '#27ae60',
          weight: 2.5,
          fillColor: '#2ecc71',
          fillOpacity: 0.45
        });
      }

      gameLastCity.textContent = '✓ ' + feat.properties.name;
      this.value = '';
      this.className = 'correct';
      setTimeout(function(self) { self.className = ''; }, 300, this);

      // Check win
      if (gameScore >= cityCount) {
        showToast('恭喜！你点亮了全部 ' + cityCount + ' 个城市！', 5000);
        endGame();
      }
    } else {
      // Already guessed
      this.value = '';
      this.className = 'correct';
      setTimeout(function(self) { self.className = ''; }, 300, this);
    }
  }
  // No match: do nothing, let user keep typing
});

// Also handle Enter to clear the field if there's partial input
gameInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var raw = this.value.trim().toLowerCase();
    if (raw && !cityMap[raw] && !shortNameMap[raw]) {
      // Wrong match - flash input red
      this.className = 'wrong';
      var self = this;
      setTimeout(function() { self.value = ''; self.className = ''; }, 400);
    }
  }
});

// ===== Toast =====
var toastTimer = null;

function showToast(msg, duration) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.style.display = 'none'; }, duration || 2000);
}
