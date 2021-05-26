import { registerBidder } from '../../src/adapters/bidderFactory';
import { BANNER } from '../../src/mediaTypes';
import { generateUUID } from '../../src/utils';

const bidUrl = '//content.predictinteractive.com';
const MEDIA_FORCE_BID = 0.50;

export const spec = {
  code: 'passback_mediaforce',
  supportedMediaTypes: [BANNER],
  /**
   * Check if the bid has valid params
   * @param {object} bid the PredICT bid to validate
   * @return boolean for whether or not a bid is valid
   */
  isBidRequestValid: function(bid) {
    return bid.params
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
      url: bidUrl + '/l/n/predictBid.php?bidder=predictMediaForce',
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
        // commenting out this floor pricing for now because reconciled revenue reporting
        // will be statically calculated at first (wins / 1000 * 0.50)
        // cpm: typeof bid.params.floor !== 'undefined' && !isNaN(parseFloat(bid.params.floor))
        //   ? parseFloat(bid.params.floor)
        //   : MEDIA_FORCE_BID,
        cpm: MEDIA_FORCE_BID,
        width: bid.sizes[0][0],
        height: bid.sizes[0][1],
        ttl: 60,
        // required by prebid, this is currently not used in our system
        creativeId: generateUUID(),
        netRevenue: true,
        currency: 'USD'
      };

      bidObject.adUrl = getMediaForceAd(bid.params);

      return bidObject
    });

    return bidResponses;
  }
}

registerBidder(spec);

/**
 * generate url for media force passback
 *
 * @param {Object} params 
 * @param {string} params.placementid
 * @returns {string}
 */
const getMediaForceAd = function (params) {
  const MFPid = '212';
  const MFSubID = '[predint]';
  const MFcm = '';
  const MFenc = '';
  const MFAd = null;
  const MFHttp = null;
  const url = "//serve2.mediaforce.com/?tagtype=JS&pid=" + MFPid + "&subid=" + MFSubID + "&cm=" + MFcm + "&enc=" + MFenc;
  return url
}
