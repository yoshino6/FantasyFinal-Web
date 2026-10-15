import { createApp } from 'vue';
import App from './App.vue';
import './styles.css';
import './anime-theme.css';
import './anime-character-inventory.css';
import './anime-auth.css';
import './anime-character-growth.css';
import './anime-main-scenes.css';
import './anime-viewport-layout.css';
import './profile-panel-art.css';
import './anime-header-compact.css';
import './game-ui-surfaces.css';
import './game-ui-dialogs.css';
import './game-ui-map.css';
import './game-ui-social.css';
import './game-ui-battle.css';
import './game-ui-journal.css';
import './game-ui-inputs.css';
import './game-ui-feedback.css';
import './equipment-layout.css';
import './item-rarity.css';

/** Keep the loading UI responsive while Vite/network prepares the game bundle. */
export function mountApp(): void {
  createApp(App).mount('#app');
}
