function loadData(datasetName, filter, cb) {
    async.waterfall([
        function(cb) { fetchDataURL(cb, datasetName, filter); },
        fetchAndParseData,
        reshapeData,
        cb
    ]);
}

function fetchDataURL(cb, datasetName, filter) {
    var pysicalContentURL = 'http://data.planetos.com/api/data/dataset_physical_contents/' + datasetName;
    var oReq = new XMLHttpRequest();
    oReq.onload = function(e) {
        var physicalContent = JSON.parse(e.target.response);
        var datasetURL = physicalContent[physicalContent.length - 1].planetosOpenDAPPreviewVariables;
        // var datasetURL = physicalContent[0].planetosOpenDAPVariables;
        datasetURL += '.dods?' + filter;
        console.log(111, datasetURL);
        cb(null, datasetURL);
    };
    oReq.open('GET', pysicalContentURL, true);
    oReq.send();
}

function fetchAndParseData(url, cb) {
    jsdap.loadData(url, function(d) {
        var data = {
            lat: d[0][3],
            lon: d[0][4],
            values: d[0][0][0][0]
        }
        cb(null, data);
    });
}

function reshapeData(data, cb) {
    // transform to lat[90, -90], lon[-180, 180]
    if (Math.min.apply(null, data.lon) >= 0) {
        // assume lon[0, 360]
        data.lon = data.lon.map(function(d, i) {
            return (d - 180);
        });
        data.values = data.values.map(function(d) {
            return d.slice(data.values[0].length / 2, data.values[0].length).concat(d.slice(0, data.values[0].length / 2));
        });
    }

    if (data.lat[0] < data.lat[1]) {
        // assume lat [-90, 90]
        data.lat = data.lat.map(function(d, i) {
            return -d;
        });
        data.values = data.values.reverse();
    }

    console.log(data, d3.extent(data.lat), d3.extent(flattenAndUniquify(data.values).flattened));
    // colorScaleDomain = d3.extent(flattenAndUniquify(values).flattened);
    cb(null, data);
}

function generateData() {
    var step = 1;
    var count = 0;

    for (var i = 90; i >= -90; i -= step) {
        lat.push(i);
        values.push([]);
        for (var j = -180; j <= 180; j += step) {
            if (lat.length === 1) {
                lon.push(j);
            }
            values[values.length - 1].push(~~(count / 65341 * 255));
            count += 1;
        }
    }
    console.log('generated', lat, lon, values, d3.extent(flattenAndUniquify(values).flattened));
    map.addLayer(new DataGridLayer());
}

function loadStaticData(cb) {
    async.waterfall([
        loadFile,
        reshapeData,
        cb
    ]);
}

function loadFile(cb) {
    var fileURL = 'gfs_wind2.json';
    var oReq = new XMLHttpRequest();
    oReq.onload = function(e) {
        var response = JSON.parse(e.target.response);

        var values = response.values;
        var magnitudes = values.map(function(d) {
            return d.map(function(dB){ return dB.magnitude; });
        });
        var angles = values.map(function(d, i) {
            return d.map(function(dB){ return dB.angle; });
        });


        // var data = [], valueU, valueV, magnitude, angle;
        // var magnitudeArray1D = [], angle1D = [];
        // for (var i = 0; i < valuesU.length; i++) {
        //  data.push([]);
        //  for (var j = 0; j < valuesU[0].length; j++) {
        //      valueU = valuesU[i][j];
        //      valueV = valuesV[i][j];

        //      magnitude = Math.sqrt(valueU*valueU+valueV*valueV);
        //      magnitudeArray1D.push(magnitude);
        //      angle = Math.atan2(valueV, valueU);
        //      angle1D.push(angle);
        //      data[i].push({
        //          magnitude: magnitude, 
        //          angle: angle
        //      });
        //  }
        // }

        var valuesFlattened = flattenAndUniquify(magnitudes);

        var data = {
            lat: response.lat,
            lon: response.lon,
            values: magnitudes,
            flattenedValues: valuesFlattened.flattened,
            valuesMinMax: [valuesFlattened.min, valuesFlattened.max],
            angles: angles
        };

        cb(null, data)
    };
    oReq.open('GET', fileURL, true);
    oReq.send();
}

function loadWindFarms_old(cb) {
    var fileURL = 'wind_farms2.csv';
    var oReq = new XMLHttpRequest();
    oReq.onload = function(e) {
        var data = d3.csv.parse(e.target.response);

        var lonlat, min = Number.MAX_VALUE, max = Number.MIN_VALUE
        data.forEach(function(d){
            lonLat = d.Coordinates.split(', ')
                .map(function(dB){ return +dB.replace(/°/ig, '');
            });

            d.lon = lonLat[1];
            d.lat = lonLat[0];
            d.capacity = +d.GeneratingCapacity.replace(/ MW/ig, '');
            if(d.capacity < min) {
                min = d.capacity;
            }
            if(d.capacity > max) {
                max = d.capacity;
            }
        });

        data.forEach(function(d){
            d.valuesMinMax = [min, max];
        });

        cb(data)
    };
    oReq.open('GET', fileURL, true);
    oReq.send();
}

function loadWindFarms(cb) {
    var fileURL = 'wind-farm-data.csv';
    var oReq = new XMLHttpRequest();
    oReq.onload = function(e) {
        var data = d3.csv.parse(e.target.response);

        var lonlat;
        var capacityMin = Number.MAX_VALUE, capacityMax = Number.MIN_VALUE;
        var magnitudeMin = Number.MAX_VALUE, magnitudeMax = Number.MIN_VALUE;
        data.forEach(function(d){
            d.lon = +d.lon;
            d.lat = +d.lat;
            d.magnitude = +d.magnitude;
            d.GeneratingCapacity = +d.GeneratingCapacity;
            d.NumberOfUnits = +d.NumberOfUnits;
            capacityMin = (d.GeneratingCapacity < capacityMin)? d.GeneratingCapacity : capacityMin;
            capacityMax = (d.GeneratingCapacity > capacityMax)? d.GeneratingCapacity : capacityMax;
            magnitudeMin = (d.magnitude < magnitudeMin)? d.magnitude : magnitudeMin;
            magnitudeMax = (d.magnitude > magnitudeMax)? d.magnitude : magnitudeMax;
        });

        data.forEach(function(d){
            d.capacityMinMax = [capacityMin, capacityMax];
            d.magnitudeMinMax = [magnitudeMin, magnitudeMax];
        });

        console.log(capacityMin, capacityMax, magnitudeMin, magnitudeMax);

        cb(data)
    };
    oReq.open('GET', fileURL, true);
    oReq.send();
}
