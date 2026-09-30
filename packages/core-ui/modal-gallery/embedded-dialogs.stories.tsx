import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SessionChatImageViewerProvider, useSessionChatImageViewer } from '../chat/session-chat-image-viewer';
import { ModalStorySurface, modalStoryParameters } from './modal-story-surface';

const meta = {
  parameters: modalStoryParameters,
  title: 'Modals/Embedded',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const IMAGE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='800' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23191919'/%3E%3Crect x='80' y='80' width='1040' height='640' rx='32' fill='%23262626' stroke='%235e5e5e' stroke-width='4'/%3E%3Ctext x='600' y='390' text-anchor='middle' fill='%23f1f1f1' font-family='sans-serif' font-size='54'%3EModal comparison image%3C/text%3E%3Ctext x='600' y='460' text-anchor='middle' fill='%23a3a3a3' font-family='sans-serif' font-size='28'%3EFull-size chat image viewer%3C/text%3E%3C/svg%3E";

function OpenImageViewer() {
  const viewer = useSessionChatImageViewer();
  useEffect(() => {
    viewer?.open({ alt: 'Modal comparison image', url: IMAGE_DATA_URL });
  }, [viewer]);
  return null;
}

export const ChatImageViewer: Story = {
  render: () => (
    <ModalStorySurface>
      <SessionChatImageViewerProvider>
        <OpenImageViewer />
      </SessionChatImageViewerProvider>
    </ModalStorySurface>
  ),
};
