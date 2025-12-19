import {DefaultPlayerEvents} from '../../enums/DefaultPlayerEvents.mjs';
import {PlayerModes} from '../../enums/PlayerModes.mjs';
import {RequestUtils} from '../../utils/RequestUtils.mjs';
import HLSPlayer from "../hls/HLSPlayer.mjs";

export default class VMPlayer extends HLSPlayer {
  constructor(client, options) {
    super(client, options);
  }

  async setSource(source) {
    try {
      console.log('source URL: '+source.url);
      const isEmbed = !source.url.includes('config?');
      const hc = [];
      for (const key in source.headers) {
        if (Object.hasOwn(source.headers, key)) {
          hc.push({
            operation: 'set',
            header: key,
            value: source.headers[key],
          });
        }
      }

      const xhr = await RequestUtils.request({
        url: source.url,
        header_commands: hc,
        responseType: isEmbed ? 'text' : 'json',
      });

      const config = xhr.response;
      const hls = !isEmbed ? config?.request?.files?.hls : this.extractVimeoHlsUrlFromIframe(config);
      if (!hls || !hls.cdns) {
        throw new Error('Vimeo HLS data not found');
      }
      const defaultCdn =
          hls.default_cdn && hls.cdns[hls.default_cdn]
              ? hls.default_cdn
              : Object.keys(hls.cdns)[0];

      let hlsUrl = hls.cdns[defaultCdn].url;

      if (!hlsUrl) {
        throw new Error('Vimeo HLS URL missing');
      }

      // Safety: normalize URL (JSON.parse should already fix \u0026)
      hlsUrl = hlsUrl.replace(/\\u0026/g, '&');

      this.source = source.copy();
      this.source.url = hlsUrl;
      this.source.mode = PlayerModes.ACCELERATED_HLS;

    } catch (e) {
      console.error(e);
      this.emit(DefaultPlayerEvents.ERROR, e);
      return;
    }

    await super.setSource(this.source);
  }

  destroy() {
    if (this.source) {
      URL.revokeObjectURL(this.source.url);
    }
    super.destroy();
  }

  getSource() {
    return this.source;
  }

  extractVimeoHlsUrlFromIframe(html) {
    const match = html.match(
        /window\.playerConfig\s*=\s*({[\s\S]+?});/
    );

    if (!match) {
      throw new Error('Vimeo iframe: playerConfig not found');
    }

    const config = JSON.parse(match[1]);
    return config?.request?.files?.hls;

  }

}
