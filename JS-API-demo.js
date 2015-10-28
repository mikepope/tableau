var viz;
var currentWorkbook;
var activeSheet;

$(document).ready(function() {

    $("#slider").slider({
        disabled: true,
        value: 800,
        min: 400,
        max: 1200,
        step: 100,
        slide: function(event, ui) {
            resizeViz(ui.value);
        }
    });
});


function loadviz() {
    var placeholderDiv = document.getElementById("tableauViz");

    var options = {
        "name": "Restaurants",
        "description": "Displays restaurant inspection information for King County (WA) for 2015",
        hideTabs: true,
        hideToolbar: true,
        height: 800,
        width: 800,
        onFirstInteractive: function() {
            currentWorkbook = viz.getWorkbook();
            activeSheet = currentWorkbook.getActiveSheet();

            // Make the slider interactive
            $( "#slider" ).slider( "option", "disabled", false );

            // Add an event listener to capture clicks on marks
            listenToMarksSelection();
        }
    };

    viz = new tableauSoftware.Viz(placeholderDiv, vizUrl, options);

    $("#slider").attr("disabled", false);

    $("#linkClearFilters").attr("disabled", false);
    return false;
}


function resizeViz(size) {
    if (activeSheet.getSheetType() === "worksheet") {
        viz.setFrameSize(size, size);
    } else {
        // Dashboards and story points
        activeSheet.changeSizeAsync({
                "behavior": "EXACTLY",
                "maxSize": {
                    "height": size,
                    "width": size
                }
            }).then(viz.setFrameSize(size, size));
    }
}


/* EVENT HANDLING */
function listenToMarksSelection() {
    console.log("listen to marks selection");
    viz.addEventListener(tableauSoftware.TableauEventName.MARKS_SELECTION, onMarksSelection);
}

function onMarksSelection(marksEvent) {
    console.log("onMarksSelection, marksEvent = " + marksEvent);
    return marksEvent.getMarksAsync().then(reportSelectedMarks);
}

function reportSelectedMarks(marks) {
    var yelpId = "";

    // Walk through all the marks and pick out the Yelp ID
    for (var markIndex = 0; markIndex < marks.length; markIndex++) {
        var pairs = marks[markIndex].getPairs();

        for (var pairIndex = 0; pairIndex < pairs.length; pairIndex++) {
            var pair = pairs[pairIndex];
            console.log("Pair index = " + pairIndex);
            console.log("Pair fieldName = " + pair.fieldName);
            console.log("Pair formattedValue = " + pair.formattedValue);

            if (pair.fieldName === "Yelp_ID") {
                yelpId = pair.formattedValue;
                console.log("Yelp ID found! Value = " + yelpId);
            }

            if (pair.fieldName === "SUM(Violation Points)") {
                sumViolationPoints = pair.formattedValue;
                console.log("sumViolationPoints found! Value = " + sumViolationPoints);
            }
        }
        displayMarkDetails(yelpId);
    }
}

function filterRestaurant(restaurantName) {
    if (activeSheet) {
        console.log("Filtering on: " + restaurantName);
        activeSheet.applyFilterAsync("Name", restaurantName, tableau.FilterUpdateType.REPLACE);
        return false;
    }
}

function clearFilters() {
    if (activeSheet) {
        activeSheet.clearFilterAsync("Name");
        activeSheet.clearFilterAsync("Violation Type");
        return false;
    }
}

function displayMarkDetails(yelpId) {
    console.log("displayMarkDetails");
    if (yelpId === "") {
        $("#dialogText").html("No Yelp information for this business!");
        $("#dialogbox").dialog({
            modal: true,
            title: "Show restaurant details",
            buttons: [{
                text: "OK",
                click: function() {
                    $(this).dialog("close");
                }
            }]
        });
        return;
    }

    // Yelp OAuth setup. This does the OAuth handshaking and creates a URL that has the token in it.
    var auth = {
        consumerKey: yelp_info.yelpConsumerKey,
        consumerSecret: yelp_info.yelpConsumerSecret,
        accessToken: yelp_info.yelpAccessToken,
        accessTokenSecret: yelp_info.yelpAccessTokenSecret
    };

    var accessor = {
        consumerSecret: auth.consumerSecret,
        tokenSecret: auth.accessTokenSecret
    };

    var parameters = [];
    parameters.push(['oauth_consumer_key', auth.consumerKey]);
    parameters.push(['oauth_consumer_secret', auth.consumerSecret]);
    parameters.push(['oauth_token', auth.accessToken]);
    parameters.push(['callback', 'displayYelpDetails']);

    var message = {
        'action': 'http://api.yelp.com/v2/business/' + yelpId,
        'method': 'GET',
        'parameters': parameters
    };

    OAuth.setTimestampAndNonce(message);
    OAuth.SignatureMethod.sign(message, accessor);

    var parameterMap = OAuth.getParameterMap(message.parameters);
    parameterMap.oauth_signature = OAuth.percentEncode(parameterMap.oauth_signature);

    var url = OAuth.addToURL(message.action, parameterMap);
    console.log(url);

    // Call Yelp using the URL with the OAuth token. Yelp doesn't support CORS, but they do support JSONP.
    var xhr = $.ajax({
        url: url,
        cache: true,
        dataType: 'jsonp',
        jsonpCallback: 'displayYelpDetails',
        contentType: 'application/json',
        success: function(data) {
            console.log("success");
        },
        error: function(xhr, ajaxOptions, thrownError) {
            console.log("Connection error: " + xhr.responseText + "\n" + thrownError);
        }
    });
}


function displayYelpDetails(data) {
    var jsonpData = data;
    console.log('jsonp callback');
    console.log(data);

    // Get a list of categories from Yelp (e.g., "Mexican", "Coffee & Tea", etc.)
    categories_list = '';
    for (var catIndex = 0; catIndex < data.categories.length; catIndex++) {
        categories_list += data.categories[catIndex][0] + ", ";
    }
    categories_list = categories_list.substring(0, categories_list.length - 2);

    var htmlOutput = "";
    htmlOutput += "<p style='font-weight:bold;font-size:1.2em;'>%%%name%%%</p>";
    htmlOutput += "<img style='float:right,margin:10px;' src='%%%image_url%%%' />";
    htmlOutput += "<p><b>Category</b>: %%%category%%%</p>";
    htmlOutput += "<p><img src='%%%ratingImgUrl%%%'/></p>";
    htmlOutput += "<p>Click <a target='_blank' href='%%%yelpUrl%%%'>here</a> to go to the Yelp site.</p>";
    htmlOutput += "<img src='https://s3-media3.fl.yelpcdn.com/assets/srv0/developer_pages/65526d1a519b/assets/img/Powered_By_Yelp_Red.png' />";

    htmlOutput = htmlOutput.replace("%%%name%%%", data.name);
    htmlOutput = htmlOutput.replace("%%%ratingImgUrl%%%", data.rating_img_url);
    htmlOutput = htmlOutput.replace("%%%image_url%%%", data.image_url);
    htmlOutput = htmlOutput.replace("%%%yelpUrl%%%", data.url);
    htmlOutput = htmlOutput.replace("%%%category%%%", categories_list);

    $("#dialogText").html(htmlOutput);
    $("#dialogbox").dialog({
        modal: true,
        width: 500,
        title: "Show restaurant details",
        buttons: [{
            text: "OK",
            click: function() {
                $(this).dialog("close");
            }
        }]
    });
}
