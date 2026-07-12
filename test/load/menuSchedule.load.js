import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 500 },  // Peak load at 500 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
    http_req_failed: ['rate<0.01'],   // Less than 1% errors
  },
};

const BASE_URL = 'http://localhost:3000/api/v1';

export default function () {
  // Simulate GET menu schedules list (Public)
  const resGet = http.get(`${BASE_URL}/menu-schedules`);
  check(resGet, {
    'GET status is 200': (r) => r.status === 200,
    'GET response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
