class AitsApi {
  name = 'aitsApi';
  displayName = 'AITS API';

  properties = [
    {
      displayName: 'Server URL',
      name: 'serverUrl',
      type: 'string',
      required: true,
      default: 'http://host.docker.internal:8000',
      description: 'Base URL of the AITS service, as seen by n8n',
    },
    {
      displayName: 'Service Key',
      name: 'serviceKey',
      type: 'string',
      typeOptions: { password: true },
      required: true,
      default: '',
      description: 'The bearer key configured for this client on the AITS server',
    },
  ];

  authenticate = {
    type: 'generic',
    properties: { headers: { Authorization: '={{ "Bearer " + $credentials.serviceKey.trim() }}' } },
  };

  test = {
    request: { baseURL: '={{ $credentials.serverUrl }}', url: '/agents/', qs: { limit: 1 } },
  };
}

module.exports = { AitsApi };
