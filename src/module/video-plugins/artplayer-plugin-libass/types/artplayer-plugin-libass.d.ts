import type Artplayer from 'artplayer'
import type SubtitlesOctopus from '../lib/types/subtitles-octopus'

export = artplayerPluginAss
export as namespace artplayerPluginAss

declare const artplayerPluginAss: (options: SubtitlesOctopus) => (art: Artplayer) => {
  name: 'artplayerPluginLibass';
  libass: SubtitlesOctopus;
  visible: boolean;
  init: () => void;
  switch: (url: string) => void;
  show: () => void;
  hide: () => void;
  destroy: () => void;
}
