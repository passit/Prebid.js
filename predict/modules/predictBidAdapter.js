import { registerBidder } from '../../src/adapters/bidderFactory';
import { BANNER } from '../../src/mediaTypes';
import { generateUUID } from '../../src/utils';

const bidUrl = '//content.predictinteractive.com';

export const spec = {
  code: 'predict',
  supportedMediaTypes: [BANNER],
  /**
   * Check if the bid has valid params
   * @param {object} bid the PredICT bid to validate
   * @return boolean for whether or not a bid is valid
   */
  isBidRequestValid: function(bid) {
    return bid.params;
  },

  /**
   * Make a server request from the list of BidRequests.
   *
   * @param {validBidRequests[]} - an array of bids
   * @return ServerRequest Info describing the request to the server.
   */
  buildRequests: function(validBidRequests, bidderRequest) {
    const bids = validBidRequests.map(item => ({
      bidId: item.bidId,
      params: item.params,
      sizes: item.sizes
    }));

    return {
      // use custom method so prebid does not fire ajax request
      method: 'POST',
      url: bidUrl + '/l/n/predictBid.php',
      data: {
        bids: bids
      },
      options: {
        withCredentials: false
      }
    }
  },

  /**
   * Unpack the response from the server into a list of bids.
   *
   * @param {ServerResponse} serverResponse A successful response from the server.
   * @return {Bid[]} An array of bids which were nested inside the server.
   */
  interpretResponse: function (serverResponse, request) {
    const bidResponses = request.data.bids.map(bid => {
      const bidObject = {
        requestId: bid.bidId,
        cpm: typeof bid.params.floor !== 'undefined' && !isNaN(parseFloat(bid.params.floor))
          ? parseFloat(bid.params.floor)
          : 0.01,
        width: bid.sizes[0][0],
        height: bid.sizes[0][1],
        ttl: 60,
        // required by prebid, this is currently not used in our system
        creativeId: bid.params.at_id || 'no_at_' + generateUUID(),
        netRevenue: false,
        currency: 'USD'
      };

      const adsterraAvailable = !!bid.params.passback_adsterra.key;
      const oneworldAvailable = !!bid.params.oneworld.adauctionid && !!bid.params.oneworld.adunitid;
      const adSenseAvailable = !!bid.params.passback_adsense.dataadslot;
      const amityAvailable = !!bid.params.passback_amity.avpublisherid && !!bid.params.passback_amity.avtagid;

      if (amityAvailable) {
        bidObject.ad = getAmityPassback(
            bid.params.passback_amity
        );
        // set the passback integration type. this should match the lowercased version
        // of the ad providers name from the database because this is ultimately the value
        // that will be passed to yeti analytics
        bidObject.passbackIntegration = 'passback_amity';
      } else if (adsterraAvailable) {
        bidObject.ad = getAdsterraPassback(
          bidObject.width,
          bidObject.height,
          bid.params.passback_adsterra
        );
        // set the passback integration type. this should match the lowercased version
        // of the ad providers name from the database because this is ultimately the value
        // that will be passed to yeti analytics
        bidObject.passbackIntegration = 'passback_adsterra';
      } else if (oneworldAvailable) {
        bidObject.ad = getOneWorldPassback(bid.params.oneworld);
        // set the passback integration type. this should match the lowercased version
        // of the ad providers name from the database because this is ultimately the value
        // that will be passed to yeti analytics
        bidObject.passbackIntegration = 'oneworld';
      } else if (adSenseAvailable) {
        bidObject.ad = getAdSensePassback(
          bidObject.width,
          bidObject.height,
          bid.params.passback_adsense
        );
        // set the passback integration type. this should match the lowercased version
        // of the ad providers name from the database because this is ultimately the value
        // that will be passed to yeti analytics
        bidObject.passbackIntegration = 'passback_adsense';
      } else {
        // else use house ad
        bidObject.adUrl = getHouseAdPassback(bid);
        // no need to set passbackIntegration prop here
        // the adstack will pass the given "predict" bidder to yeti analtyics
      }

      return bidObject
    });

    return bidResponses;
  }
}

registerBidder(spec);

/**
* generate predICT house ad passback
*
* @param {Object} bid 
*/
const getHouseAdPassback = function(bid) {
  const passbackMaxRand = 500;
  // Create the base ad URL
  let baseUrl = bidUrl + '/images/index.php?w=' + bid.sizes[0][0] + '&h=' + bid.sizes[0][1] + '&v=' + Math.floor(Math.random() * passbackMaxRand);

  // Add the event string
  // passback tracking event is deprecated
  // baseUrl += '&event=' + encodeURIComponent(JSON.stringify(bid.params.event));

  // Add in values from the passback (if needed)
  if (typeof bid.params.passback !== 'undefined' && bid.params.passback !== null) {
    baseUrl += '&' + bid.params.passback;
  }

  // Add pred_ra if needed
  if (typeof bid.params.pred_ra === 'yes') {
    baseUrl += '&pred_ra=yes';
  }

  // Return the URL
  return baseUrl;
}

/**
 * generate ad for adsense passback
 * 
 * @param {number} width
 * @param {number} height
 * @param {Object} adSense
 * @param {string} adSense.publisherid
 * @returns {string}
 */
const getAdSensePassback = function (
  width,
  height,
  adSense
) {
  // return `
  //   <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
  //   <ins class="adsbygoogle"
  //     style="display:inline-block;width:${width}px;height:${height}px;"
  //     data-ad-client="ca-pub-5220182163543194"
  //     data-ad-slot="${adSense.dataadslot}"></ins>
  //   <script>
  //     (adsbygoogle = window.adsbygoogle || []).push({});
  //   </script> 
  // `
  return `
    <script type="text/javascript">
      window.google_ad_client = "ca-pub-5220182163543194";
      window.google_ad_slot = "${adSense.dataadslot}";
      window.google_ad_width = ${width};
      window.google_ad_height = ${height};
    </script>
    <script type="text/javascript" src="https://pagead2.googlesyndication.com/pagead/show_ads.js"></script>
  `
}

/**
 * generate ad for oneworld passback
 *
 * @param {Object} oneworld
 * @param {string} oneworld.adauctionid
 * @param {string} oneworld.adunitid
 * @returns {string}
 */
const getOneWorldPassback = function (oneworld) {
  return `
      <script defer>
        window.onload = function loadOneWorld () {
          document.body.style.margin = 0;
          document.body.style.padding = 0;
          var dv = document.createElement('div');
          var el = document.createElement('script');
          dv.id = 'RTK_${oneworld.adunitid}';
          document.body.appendChild(dv);
          el.async = true;
          el.type = 'text/javascript';
          el.src = ((window.top.document.location.protocol === 'http:') ? 'http:' : 'https:')
          + '//delivery.1worldonline.com/${oneworld.adauctionid}/${oneworld.adunitid}/jita.js';
          document.body.appendChild(el);
        }
      </script>
    `;
}

/**
 * generate ad for adsterra passback
 * 
 * @param {number} width
 * @param {height} height
 * @param {Object} adsterra
 * @param {string} adsterra.key
 * @returns {string}
 */
const getAdsterraPassback = function(width, height, adsterra) {
  return `
    <script type="text/javascript">
      atOptions = {
        'key' : '${adsterra.key}',
        'format' : 'iframe',
        'height' : ${height},
        'width' : ${width},
        'params' : {}
      };
      document.write('<scr' + 'ipt type="text/javascript" src="http' + (location.protocol === 'https:' ? 's' : '') + '://www.displayformatrevenue.com/${adsterra.key}/invoke.js"></scr' + 'ipt>');
    </script>
  `
}

/**
 * generate amity digital passback
 * 
 * @param {Object} amity
 * @returns {string}
 */
const getAmityPassback = function(amity) {
    return `
        <script
            async
            id="AV${amity.avtagid}"
            type="text/javascript"
            src="https://tg1.amitydigital.io/api/adserver/spt?AV_TAGID=${amity.avtagid}&AV_PUBLISHERID=${amity.avpublisherid}"
        ></script>
    `;
}
