import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import i18n from '@/i18n';
import { reportError } from '@/lib/monitoring';
import { Body, Button, H1 } from './ui';

/** Αν «σκάσει» μια οθόνη: φιλικό μήνυμα + «Ξανά» αντί για λευκή οθόνη (και αναφορά στο Sentry) */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    reportError(error, { where: 'ErrorBoundary' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12 }}>
        <H1>{i18n.t('errors.crashTitle')}</H1>
        <Body muted>{i18n.t('errors.crashBody')}</Body>
        <Button title={i18n.t('common.retry')} onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
