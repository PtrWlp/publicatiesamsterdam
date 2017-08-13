'use strict';

var requestP = require('request-promise');
var cheerio = require('cheerio');
var entities = require('html-entities').AllHtmlEntities;
var fs = require('fs');
var sleeptime = 500;
var startPage = 0;


var jaar = '2017';
var stadsdeel = ''; // Alle stadsdelen
// stadsdeel = '3613'; // specifiek stadsdeel

var stadsdelen = [{code:"3607", name: "Centrum"},
                  {code:"3608", name: "Nieuw-West"},
                  {code:"3609", name: "Noord"},
                  {code:"3610", name: "Oost"},
                  {code:"3611", name: "West"},
                  {code:"3612", name: "Zuid"},
                  {code:"3613", name: "Zuidoost"}];

var outfile = `bekendmakingen.xls`;
fs.writeFile(outfile, 'jaar,stadsdeel,titel,aanvang,publicatieDatum,dagen,omschrijving,url,performance,dagen<6weken\n', function (err) {
  if (err) throw err;
});


console.log(buildIndexURL(jaar, '', 0))

function getIndexPage(jaar, stadsdeelCode, page) {

    if (page > (startPage+2)) {
//       return; // bail out for now
    }

    let uri = buildIndexURL(jaar, stadsdeelCode, page);

    requestP(uriPlusOption(uri))
    .then(function ($) {

        var counter = $('div.counter').find('p').eq(1).html();
        // Resultaten 51 t/m 100 getoond&#xA0;-&#xA0;1184&#xA0;resultaten gevonden
        var nrResults = counter.split(';')[2].replace('&#xA0', '');
        console.log('page ' + (page+1) + ' of ' + Math.ceil(nrResults /100));    

        var detailpageread = 1;
        var $detailregels = $('div.resultaat');
        // console.log($detailregels.length, 'regels gevonden op page ', page);
        $detailregels.find('h3 a').each(function (index, element) {
            //console.log(element.attribs.href);
            if (element.attribs.href.indexOf('/besluit') === -1) {
               return;
            }
            if (detailpageread > 3) {
//               return;
            }
            detailpageread++;

            sleep(sleeptime, function() {getDetailPage(element.attribs.href, jaar, stadsdeelCode, page)}); // dont want to attack
        });
        page++;

        if (isLastIndexPage($)) {
            console.log('last page found');
        } else {
            sleep(sleeptime,  function() {getIndexPage(jaar, stadsdeelCode, page)}); // dont want to attack!
        }

    })
    .catch(function (err) {
        // Crawling failed or Cheerio choked... 
        console.log('error index: ', err);
        // or end of list
    });

}

function uriPlusOption(uri) {
    return  {
        uri: uri,
        transform: function (body) {
            return cheerio.load(body);
        }
    };
}

function buildIndexURL(jaar, stadsdeelCode, page) {
    return `https://bekendmakingen.amsterdam.nl/algemene-onderdelen/overzicht-${jaar}/?mode=&ZoeTyp=Zip&Zoe=&Zoe_Clt_SelItmIdt=394%2C466%2C467&Zoe_Selected_facet&pager_page=${page}`;
}

function sleep(time, callback) {
    var stop = new Date().getTime();
    while(new Date().getTime() < stop + time) {
        ;
    }
    callback();
}

function isLastIndexPage($body) {
    var countertext  = entities.decode($body('#main .counter').html());
    if (countertext && countertext === "") {
        return false; // wrong page? 405 page?  dont continue
    }
    // console.log(countertext);
    // 51 t/m 100 getoond - 200 resultaten gevonden
    var re = /t\/m \d+ getoond\s-\s\d+/gi;
    var displayedXofYResults = countertext.match(re)[0].match(/\d+/g);

    return displayedXofYResults[0] === displayedXofYResults[1];
}

function getDetailPage(url, jaar, stadsdeelCode, page) {
    console.log('reading: ', url);
    requestP(uriPlusOption(url))
    .then(function ($) {
        var publicatieDatum = isoDateFromDutchDate($('#Content .brondatum').html());
        var titel = $('#Content .iprox-content').find('p').find('strong').html();
        if (titel === "Verleend") {
            titel = $('#Content .iprox-content').find('p').eq(1).find('strong').html();
        }
        if (!titel) {
            titel = $('#Content .content').find('h1').html();
        }
        titel = titel.replace('Besluit evenementenvergunning ', '');

        var omschrijving = $('#Content .iprox-content').find('p').html();

        if (omschrijving === "<strong>Verleend</strong>") {
            omschrijving = $('#Content .iprox-content').find('p').eq(1).html();
        }

        omschrijving = omschrijving.replace(`<strong>${titel}</strong>`, '');
        if (omschrijving === '') {
            // must have been all strongg
            omschrijving = titel.replace('<strong>', '').replace('</strong>', '');
        }

        // Namens de Burgemeester van Amsterdam heeft de voorzitter van het algemeen bestuur van de bestuurscommissie van stadsdeel Zuidoost op 11 mei 2016
        var rookgordijn = 'Namens de Burgemeester van Amsterdam'.toLowerCase();
        if (omschrijving.toLowerCase().indexOf(rookgordijn) !== -1) {
            console.log('rookgordijn');
            omschrijving = omschrijving.substr(omschrijving.indexOf(jaar) + 5);
        }

        rookgordijn = 'Er is op '.toLowerCase();
        if (omschrijving.toLowerCase().indexOf(rookgordijn) !== -1) {
            omschrijving = omschrijving.substr(omschrijving.indexOf(jaar) + 5);
        }

        omschrijving = entities.decode(omschrijving);
        if (omschrijving.substring(0,1) === ',') {
            omschrijving = omschrijving.substring(1);
        }
        if (omschrijving.substring(0,1) === ' ') {
            omschrijving = omschrijving.substring(1);
        }
        titel = titel ? entities.decode(titel) : '';

        // will be comma-separated file so remove commas here.
        omschrijving = omschrijving.replace(/,/g, '.');
        titel = titel.replace(/,/g, '.');

        var aanhef = $('#Content .bekendmaking').find('h1').html();
        //var type = aanhef.indexOf('Besluit') === 0 ? 'Besluit' : 'Aanvraag';
        var stadsdeelNaam = 'unknown';

        try {
            stadsdeelNaam = entities.decode($('#Content .stadsdeel').html()).replace('Stadsdeel ','').replace('-', '').replace('-', '');
        }
        catch(err) {
            console.log('oei');
            console.log($('#Content .stadsdeel').html());
        }

        var aanvang = seekStartDate(omschrijving);

        if (omschrijving.toLowerCase().indexOf('koningsnacht') !== -1) {
            aanvang = `26-4-${jaar}`;
        } else if (omschrijving.toLowerCase().indexOf('koningsdag') !== -1) {
            aanvang = `27-4-${jaar}`;
        }

        var dagenTijd = daysInBetween(publicatieDatum, aanvang);
        var dagenBinnen6Weken = dagenTijd < 42 ? dagenTijd : '';

        var performance;

        if (dagenTijd === '') {
            performance = 'onbekend';
        } else if (dagenTijd < 1) {
            performance = 'A. te laat';
        } else if (dagenTijd < 7) {
            performance = 'B. < 1 week';
        } else if (dagenTijd < 14) {
            performance = 'C. < 2 weken';
        } else if (dagenTijd < 21) {
            performance = 'D. < 3 weken';
        } else if (dagenTijd < 42) {
            performance = 'E. < 6 weken';
        } else {
            performance = 'F. op tijd';
        }

        if (omschrijving.toLowerCase().indexOf('buiten behandeling') !== -1) {
            console.log('buiten behandeling');
        } else {
            fs.appendFile(outfile, `${jaar},${stadsdeelNaam},"${titel}",${aanvang},${publicatieDatum},${dagenTijd},"${omschrijving}",${url},${performance},${dagenBinnen6Weken}\n`, function (err) {
            });
        }

    })
    .catch(function (err) {
        // Crawling failed or Cheerio choked... 
        console.log('error detail: ', err);
        return false;
    });

}

function seekStartDate(omschrijving) {

    omschrijving = omschrijving.toLowerCase();
    omschrijving = omschrijving.replace('januari.', `januari ${jaar}.`);
    omschrijving = omschrijving.replace('februari.', `februari ${jaar}.`);
    omschrijving = omschrijving.replace('maart.', `maart ${jaar}.`);
    omschrijving = omschrijving.replace('april.', `april ${jaar}.`);
    omschrijving = omschrijving.replace('mei.', `mei ${jaar}.`);
    omschrijving = omschrijving.replace('juni.', `juni ${jaar}.`);
    omschrijving = omschrijving.replace('juli.', `juli ${jaar}.`);
    omschrijving = omschrijving.replace('augustus.', `augustus ${jaar},`);
    omschrijving = omschrijving.replace('september.', `september ${jaar}.`);
    omschrijving = omschrijving.replace('oktober.', `oktober ${jaar}.`);
    omschrijving = omschrijving.replace('november.', `november ${jaar}.`);
    omschrijving = omschrijving.replace('december.', `december ${jaar}.`);
    
    var parts = omschrijving.split(/[\s,]+/);

    var monthPart = '';
    var dayPart = '';
    var aanvang = '';

    for (var i = 0; i < parts.length; ++i) {
        var part = parts[i];
        if (['januari','februari','maart','april','mei','juni','juli','september','augustus','oktober','november','december'].indexOf(part) > -1) {
            monthPart = part;
            dayPart = parts[i-1];
            
            if (parts[i-2] === 't/m') {
                dayPart = parts[i-3];
            } else if (parts[i-2] === 'en') {
                dayPart = parts[i-3];
            } else      if (i > 5 && parts[i-5] === 'tot' && parts[i-4] === 'en') {
                dayPart = parts[i-6];
            }
            aanvang = isoDateFromDutchDate(dayPart + ' ' + monthPart + ' ' + jaar);
            break;
        }
    }

    return aanvang;

}

function isoDateFromDutchDate(value) {
    var arr = value.split(' ');
    if(!arr || arr.length !== 3) {
        return value;
    }
    var months = ["zeroitem", "januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
    return arr[0] + '-' + months.indexOf(arr[1].toLowerCase()) + '-' + arr[2];
}

function daysInBetween(dateString1, dateString2) {
    var parts = `${dateString1}-${dateString2}`.split('-');
    if (parts.length !== 6) {
        return '';
    }
    var date1 = new Date(parts[2] + '-' + parts[1] + '-' + parts[0]);
    var date2 = new Date(parts[5] + '-' + parts[4] + '-' + parts[3]);
    var _MS_PER_DAY = 1000 * 60 * 60 * 24;

    return Math.floor((date2 - date1) / _MS_PER_DAY);    
}

function decodeEntities(encodedString) {
    var textArea = document.createElement('textarea');
    textArea.innerHTML = encodedString;
    return textArea.value;
}

getIndexPage(jaar, stadsdeel, startPage);


