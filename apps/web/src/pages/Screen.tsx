import { useEffect } from 'react';
import { useParams } from 'react-router';
import { BigScreen, Stage } from '../components/BigScreen';
import { api } from '../lib/api';
import { GameSocket, resetClock } from '../lib/socket';
import { useGame } from '../lib/store';

/** Read-only big screen for a second window/projector: the laptop keeps the controls. */
export default function Screen() {
  const { pin = '' } = useParams();
  useEffect(() => {
    useGame.getState().reset();
    resetClock();
    const s = new GameSocket(pin, 'screen', { getTicket: async () => (await api.ticket(pin, 'screen')).ticket });
    s.connect();
    return () => s.close();
  }, [pin]);
  return (
    <Stage>
      <BigScreen isHost={false} />
    </Stage>
  );
}
