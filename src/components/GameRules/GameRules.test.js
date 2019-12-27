import React from 'react';
import ReactDOM from 'react-dom';
import { HashRouter } from 'react-router-dom';
import { GameRules } from '.';

it('renders without crashing', () => {
  const div = document.createElement('div');
  ReactDOM.render(<HashRouter><GameRules /></HashRouter>, div);
});
