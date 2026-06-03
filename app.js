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

// ===== Province Lookup Table =====
var PROVINCE_MAP = {
  11: '北京市', 12: '天津市', 13: '河北省', 14: '山西省', 15: '内蒙古自治区',
  21: '辽宁省', 22: '吉林省', 23: '黑龙江省',
  31: '上海市', 32: '江苏省', 33: '浙江省', 34: '安徽省', 35: '福建省',
  36: '江西省', 37: '山东省',
  41: '河南省', 42: '湖北省', 43: '湖南省', 44: '广东省', 45: '广西壮族自治区', 46: '海南省',
  50: '重庆市', 51: '四川省', 52: '贵州省', 53: '云南省', 54: '西藏自治区',
  61: '陕西省', 62: '甘肃省', 63: '青海省', 64: '宁夏回族自治区', 65: '新疆维吾尔自治区',
  71: '台湾省', 81: '香港特别行政区', 82: '澳门特别行政区'
};

function getProvinceName(gb) {
  if (!gb || gb.length < 9) return '';
  var code = gb.indexOf('156') === 0 ? gb.substring(3, 5) : gb.substring(0, 2);
  return PROVINCE_MAP[code] || '';
}

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

// Build province → cities index
var provinceCities = {};
var provinceNameToCode = {};
for (var pCode in PROVINCE_MAP) {
  provinceCities[pCode] = [];
  provinceNameToCode[PROVINCE_MAP[pCode].toLowerCase()] = pCode;
  // Also add short name (e.g. "安徽" for "安徽省")
  var shortPName = PROVINCE_MAP[pCode].replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '').toLowerCase();
  if (shortPName !== PROVINCE_MAP[pCode].toLowerCase()) {
    provinceNameToCode[shortPName] = pCode;
  }
}
geoData.features.forEach(function(f) {
  var gb = f.properties.gb || '';
  if (gb.length < 9) return;
  var pCode = gb.indexOf('156') === 0 ? gb.substring(3, 5) : gb.substring(0, 2);
  if (provinceCities[pCode]) {
    provinceCities[pCode].push(f);
  }
});

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

    layer.on('click', function(e) {
      if (!gameActive) {
        if (e.originalEvent && e.originalEvent.ctrlKey) {
          toggleMultiSelect(feature);
        } else {
          clearMultiSelect();
          clearProvinceHighlight();
          selectSingleFeature(feature);
        }
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

// ===== Multi-Select (Ctrl+Click) =====
var selectedFeatures = [];

function selectSingleFeature(f) {
  selectedFeatures = [f];
  showDetail(f);
  highlightFeature(f._layer);
}

function clearMultiSelect() {
  selectedFeatures.forEach(function(f) {
    if (f._layer) geoLayer.resetStyle(f._layer);
  });
  selectedFeatures = [];
}

function toggleMultiSelect(f) {
  var idx = selectedFeatures.indexOf(f);
  if (idx !== -1) {
    // Deselect
    selectedFeatures.splice(idx, 1);
    if (f._layer) geoLayer.resetStyle(f._layer);
  } else {
    // Select
    selectedFeatures.push(f);
    if (f._layer) {
      f._layer.setStyle({
        color: '#2980b9',
        weight: 2.5,
        fillColor: '#3498db',
        fillOpacity: 0.4
      });
    }
  }
  showMultiDetail();
}

function showMultiDetail() {
  var panel = document.getElementById('detail-panel');
  if (selectedFeatures.length === 0) {
    panel.innerHTML = '<div class="placeholder"><div class="icon">🗺️</div><div>搜索或点击地图上的城市查看详情</div></div>';
    return;
  }
  var html = '';
  selectedFeatures.forEach(function(f, i) {
    var name = f.properties.name || '未知';
    var gb = f.properties.gb || '';
    var displayGb = gb;
    if (displayGb && displayGb.length > 6 && displayGb.indexOf('156') == 0) {
      displayGb = displayGb.substring(3);
    }
    var province = getProvinceName(gb);
    html += '<div class="detail-card' + (i > 0 ? ' multi-card' : '') + '">' +
      '<span class="num">' + (i + 1) + '.</span> ' +
      '<h2>' + name + '</h2>' +
      '<div class="gb">' + displayGb + '</div>' +
      (province ? '<div class="info-row"><span class="label">省份</span><span class="value">' + province + '</span></div>' : '') +
      '</div>';
  });
  panel.innerHTML = html;
}

var searchInput = document.getElementById('search-input');
var searchResults = document.getElementById('search-results');
var allFeatures = geoData.features;

// Track province-highlighted layers so we can clear them
var provinceHighlightedLayers = [];

function clearProvinceHighlight() {
  provinceHighlightedLayers.forEach(function(layer) {
    if (layer._layer) geoLayer.resetStyle(layer._layer);
  });
  provinceHighlightedLayers = [];
}

function highlightProvince(provCode) {
  clearProvinceHighlight();
  clearMultiSelect();
  // Reset any single-feature highlight
  if (highlightedLayer) {
    geoLayer.resetStyle(highlightedLayer);
    highlightedLayer = null;
  }

  var cities = provinceCities[provCode];
  if (!cities || cities.length === 0) return;

  cities.forEach(function(f) {
    if (f._layer) {
      f._layer.setStyle({
        color: '#2980b9',
        weight: 2,
        fillColor: '#3498db',
        fillOpacity: 0.4
      });
      provinceHighlightedLayers.push(f);
    }
  });

  // Show summary in detail panel
  var provName = PROVINCE_MAP[provCode];
  var panel = document.getElementById('detail-panel');
  var html = '<div class="detail-card">' +
    '<h2>' + provName + '</h2>' +
    '<div class="info-row"><span class="label">城市数量</span><span class="value">' + cities.length + '</span></div>';
  cities.forEach(function(f) {
    var name = f.properties.name || '未知';
    html += '<div class="city-row">' + name + '</div>';
  });
  html += '</div>';
  panel.innerHTML = html;

  // Zoom to fit all cities in the province
  var group = L.featureGroup(cities.map(function(f) { return f._layer; }));
  if (group.getBounds().isValid()) {
    map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 8 });
  }
}

searchInput.addEventListener('input', function() {
  var q = this.value.trim().toLowerCase();
  searchResults.style.display = q ? 'block' : 'none';
  searchResults.innerHTML = '';
  if (!q) {
    // Clear province highlight when search is empty
    clearProvinceHighlight();
    document.getElementById('detail-panel').innerHTML =
      '<div class="placeholder"><div class="icon">🗺️</div><div>搜索或点击地图上的城市查看详情</div></div>';
    return;
  }

  // Check if query exactly matches a province name (full or short)
  var provCode = provinceNameToCode[q];
  if (provCode) {
    searchResults.style.display = 'none'; // Don't show dropdown
    highlightProvince(provCode);
    return;
  }

  // Not a province match — clear any previous province highlight
  clearProvinceHighlight();

  // Normal city search
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
    var displayGb = gb;
    if (displayGb && displayGb.length > 6 && displayGb.indexOf('156') == 0) {
      displayGb = displayGb.substring(3);
    }
    var province = getProvinceName(gb);
    var provinceHtml = province ? '<span class="province">' + province + '</span>' : '';
    div.innerHTML = name + provinceHtml + '<span class="gb-code">' + displayGb + '</span>';
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
  clearMultiSelect();
  clearProvinceHighlight();
  selectSingleFeature(f);
  var layer = f._layer;
  if (layer) {
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

  var province = getProvinceName(gb);
  panel.innerHTML = '<div class="detail-card">' +
    '<h2>' + name + '</h2>' +
    '<div class="gb">' + displayGgb + '</div>' +
    (province ? '<div class="info-row"><span class="label">省份</span><span class="value">' + province + '</span></div>' : '') +
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
  clearProvinceHighlight();

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
