Here's the api to call an observability query:
https://api.cloudflare.com/client/v4/accounts/f855e2dd8145bf97126b4cdd08464a5e/workers/observability/telemetry/query

Here's an example POST body:

```json
{"view":"calculations","limit":10,"dry":true,"queryId":"workers-logs","parameters":{"datasets":["cloudflare-workers"],"filters":[{"key":"$workers.scriptName","operation":"eq","value":"simulated-service","type":"string","id":"2c50eab8-ed6a-456e-a8af-4c9c90d3117f"}],"calculations":[{"key":"$workers.wallTimeMs","keyType":"number","operator":"p999","alias":"P999 Wall","id":"6f7fbbb4-962d-4a35-87e7-e9077d2a85fa"},{"key":"$workers.wallTimeMs","keyType":"number","operator":"p99","alias":"P99 Wall","id":"4b4fa47e-9251-49e9-b932-c815da3ac241"},{"key":"$workers.wallTimeMs","keyType":"number","operator":"p90","alias":"P90 Wall","id":"9b9875e1-a6b3-47f7-9fe3-d96cb1ce19a4"},{"key":"$workers.wallTimeMs","keyType":"number","operator":"median","alias":"P50 Wall","id":"c45753e6-0460-4f10-81e6-454259d4f584"}],"groupBys":[],"havings":[]},"timeframe":{"to":1753900161102,"from":1753896561102}}
```

```json
{"view":"calculations","limit":10,"dry":false,"queryId":"workers-logs","parameters":{"datasets":["cloudflare-workers"],"filters":[{"key":"$workers.scriptName","operation":"eq","value":"simulated-service","type":"string","id":"a2a0a615-f90b-40a2-9c13-e78a87d1ef8a"}],"calculations":[{"key":"$workers.wallTimeMs","keyType":"number","operator":"p999","alias":"P999 Wall","id":"d9d0d24b-ff2c-4df2-a535-3b409cd15d56"},{"key":"$workers.wallTimeMs","keyType":"number","operator":"p99","alias":"P99 Wall","id":"c2558ecb-b7f0-4d83-b67f-45175144a9dd"},{"key":"$workers.wallTimeMs","keyType":"number","operator":"p90","alias":"P90 Wall","id":"7e58e763-b2c2-4c71-9f62-55e76357d858"},{"key":"$workers.wallTimeMs","keyType":"number","operator":"median","alias":"P50 Wall","id":"8824ffe1-3700-484f-b041-eecfb99ef08d"}],"groupBys":[],"havings":[]},"timeframe":{"from":1750306547675,"to":1753906547675}}
```

Here it is as a curl request:
```
curl "https://api.cloudflare.com/client/v4/accounts/$cf_account_id/workers/observability/telemetry/query" \
  -X POST \
  -H "Authorization: Bearer $cf_api_token" \
  -H "Content-Type: application/json" \
  -d '{
    "view": "calculations",
    "limit": 10,
    "dry": true,
    "queryId": "workers-logs",
    "parameters": {
      "datasets": ["cloudflare-workers"],
      "filters": [
        {
          "key": "$workers.scriptName",
          "operation": "eq",
          "value": "simulated-service",
          "type": "string",
          "id": "2c50eab8-ed6a-456e-a8af-4c9c90d3117f"
        }
      ],
      "calculations": [
        {
          "key": "$workers.wallTimeMs",
          "keyType": "number",
          "operator": "p999",
          "alias": "P999 Wall",
          "id": "6f7fbbb4-962d-4a35-87e7-e9077d2a85fa"
        },
        {
          "key": "$workers.wallTimeMs",
          "keyType": "number",
          "operator": "p99",
          "alias": "P99 Wall",
          "id": "4b4fa47e-9251-49e9-b932-c815da3ac241"
        },
        {
          "key": "$workers.wallTimeMs",
          "keyType": "number",
          "operator": "p90",
          "alias": "P90 Wall",
          "id": "9b9875e1-a6b3-47f7-9fe3-d96cb1ce19a4"
        },
        {
          "key": "$workers.wallTimeMs",
          "keyType": "number",
          "operator": "median",
          "alias": "P50 Wall",
          "id": "c45753e6-0460-4f10-81e6-454259d4f584"
        }
      ],
      "groupBys": [],
      "havings": []
    },
    "timeframe": {
      "to": 1753900161102,
      "from": 1753896561102
    }
  }'
```

And here's an example reponse:
```json
{
    "success": true,
    "errors": [],
    "messages": [
        {
            "message": "Successful request"
        }
    ],
    "result": {
        "calculations": [
            {
                "alias": "P999 Wall",
                "calculation": "p999($workers.wallTimeMs)",
                "aggregates": [
                    {
                        "value": 1021,
                        "interval": 1,
                        "sampleInterval": 1,
                        "count": 3457
                    }
                ],
                "series": [
                    {
                        "time": "2025-07-30 17:31:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:32:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:33:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:34:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:35:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:36:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:37:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:38:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:39:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:40:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:41:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 12
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:42:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 4
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:43:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:44:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:45:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:46:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:47:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:48:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:49:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:50:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:51:00",
                        "data": [
                            {
                                "value": 10,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 18
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:52:00",
                        "data": [
                            {
                                "value": 949,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 512
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:53:00",
                        "data": [
                            {
                                "value": 699,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 470
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:54:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:55:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:56:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 6
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:57:00",
                        "data": [
                            {
                                "value": 999,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 472
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:58:00",
                        "data": [
                            {
                                "value": 998,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 462
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:59:00",
                        "data": [
                            {
                                "value": 10,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 60
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:00:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:01:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:02:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:03:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:04:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:05:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:06:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:07:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:08:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:09:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:10:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:11:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:12:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:13:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:14:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:15:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:16:00",
                        "data": [
                            {
                                "value": 998,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 474
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:17:00",
                        "data": [
                            {
                                "value": 997,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 506
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:18:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 20
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:19:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:20:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:21:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:22:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:23:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:24:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:25:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:26:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:27:00",
                        "data": [
                            {
                                "value": 1094,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 232
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:28:00",
                        "data": [
                            {
                                "value": 1175,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 209
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:29:00",
                        "data": []
                    }
                ]
            },
            {
                "alias": "P99 Wall",
                "calculation": "p99($workers.wallTimeMs)",
                "aggregates": [
                    {
                        "value": 27,
                        "interval": 1,
                        "sampleInterval": 1,
                        "count": 3457
                    }
                ],
                "series": [
                    {
                        "time": "2025-07-30 17:31:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:32:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:33:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:34:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:35:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:36:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:37:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:38:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:39:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:40:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:41:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 12
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:42:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 4
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:43:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:44:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:45:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:46:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:47:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:48:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:49:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:50:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:51:00",
                        "data": [
                            {
                                "value": 10,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 18
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:52:00",
                        "data": [
                            {
                                "value": 11,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 512
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:53:00",
                        "data": [
                            {
                                "value": 231,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 470
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:54:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:55:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:56:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 6
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:57:00",
                        "data": [
                            {
                                "value": 998,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 472
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:58:00",
                        "data": [
                            {
                                "value": 998,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 462
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:59:00",
                        "data": [
                            {
                                "value": 10,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 60
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:00:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:01:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:02:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:03:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:04:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:05:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:06:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:07:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:08:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:09:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:10:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:11:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:12:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:13:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:14:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:15:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:16:00",
                        "data": [
                            {
                                "value": 10,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 474
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:17:00",
                        "data": [
                            {
                                "value": 10,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 506
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:18:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 20
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:19:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:20:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:21:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:22:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:23:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:24:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:25:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:26:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:27:00",
                        "data": [
                            {
                                "value": 1021,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 232
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:28:00",
                        "data": [
                            {
                                "value": 27,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 209
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:29:00",
                        "data": []
                    }
                ]
            },
            {
                "alias": "P90 Wall",
                "calculation": "p90($workers.wallTimeMs)",
                "aggregates": [
                    {
                        "value": 13,
                        "interval": 1,
                        "sampleInterval": 1,
                        "count": 3457
                    }
                ],
                "series": [
                    {
                        "time": "2025-07-30 17:31:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:32:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:33:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:34:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:35:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:36:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:37:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:38:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:39:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:40:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:41:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 12
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:42:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 4
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:43:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:44:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:45:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:46:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:47:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:48:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:49:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:50:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:51:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 18
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:52:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 512
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:53:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 470
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:54:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:55:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:56:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 6
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:57:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 472
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:58:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 462
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:59:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 60
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:00:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:01:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:02:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:03:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:04:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:05:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:06:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:07:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:08:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:09:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:10:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:11:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:12:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:13:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:14:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:15:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:16:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 474
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:17:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 506
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:18:00",
                        "data": [
                            {
                                "value": 9,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 20
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:19:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:20:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:21:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:22:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:23:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:24:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:25:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:26:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:27:00",
                        "data": [
                            {
                                "value": 25,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 232
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:28:00",
                        "data": [
                            {
                                "value": 25,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 209
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:29:00",
                        "data": []
                    }
                ]
            },
            {
                "alias": "P50 Wall",
                "calculation": "median($workers.wallTimeMs)",
                "aggregates": [
                    {
                        "value": 8,
                        "interval": 1,
                        "sampleInterval": 1,
                        "count": 3457
                    }
                ],
                "series": [
                    {
                        "time": "2025-07-30 17:31:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:32:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:33:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:34:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:35:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:36:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:37:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:38:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:39:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:40:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:41:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 12
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:42:00",
                        "data": [
                            {
                                "value": 1,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 4
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:43:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:44:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:45:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:46:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:47:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:48:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:49:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:50:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:51:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 18
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:52:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 512
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:53:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 470
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:54:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:55:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 17:56:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 6
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:57:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 472
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:58:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 462
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 17:59:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 60
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:00:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:01:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:02:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:03:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:04:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:05:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:06:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:07:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:08:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:09:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:10:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:11:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:12:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:13:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:14:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:15:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:16:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 474
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:17:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 506
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:18:00",
                        "data": [
                            {
                                "value": 8,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 20
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:19:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:20:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:21:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:22:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:23:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:24:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:25:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:26:00",
                        "data": []
                    },
                    {
                        "time": "2025-07-30 18:27:00",
                        "data": [
                            {
                                "value": 18,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 232
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:28:00",
                        "data": [
                            {
                                "value": 19,
                                "interval": 1,
                                "sampleInterval": 1,
                                "count": 209
                            }
                        ]
                    },
                    {
                        "time": "2025-07-30 18:29:00",
                        "data": []
                    }
                ]
            }
        ],
        "run": {
            "id": "mw4wg66n4ph4rxpb3rgn6so8",
            "query": {
                "id": "workers-logs",
                "description": "",
                "name": "",
                "generated": false,
                "parameters": {
                    "datasets": [
                        "cloudflare-workers"
                    ],
                    "filters": [
                        {
                            "key": "$workers.scriptName",
                            "operation": "eq",
                            "value": "simulated-service",
                            "type": "string"
                        }
                    ],
                    "havings": [],
                    "calculations": [
                        {
                            "key": "$workers.wallTimeMs",
                            "keyType": "number",
                            "operator": "p999",
                            "alias": "P999 Wall"
                        },
                        {
                            "key": "$workers.wallTimeMs",
                            "keyType": "number",
                            "operator": "p99",
                            "alias": "P99 Wall"
                        },
                        {
                            "key": "$workers.wallTimeMs",
                            "keyType": "number",
                            "operator": "p90",
                            "alias": "P90 Wall"
                        },
                        {
                            "key": "$workers.wallTimeMs",
                            "keyType": "number",
                            "operator": "median",
                            "alias": "P50 Wall"
                        }
                    ],
                    "groupBys": []
                },
                "workspaceId": "f855e2dd8145bf97126b4cdd08464a5e",
                "environmentId": "cloudflare",
                "userId": "mark-testing-new-config-ui@workers-for-platforms-dev.cfdata.org",
                "created": "2025-07-30T18:29:21.790Z",
                "updated": "2025-07-30T18:29:21.790Z"
            },
            "accountId": "f855e2dd8145bf97126b4cdd08464a5e",
            "workspaceId": "f855e2dd8145bf97126b4cdd08464a5e",
            "environmentId": "cloudflare",
            "timeframe": {
                "from": 1753896561102,
                "to": 1753900161102
            },
            "userId": "mark-testing-new-config-ui@workers-for-platforms-dev.cfdata.org",
            "status": "COMPLETED",
            "granularity": 60000,
            "dry": true,
            "statistics": {
                "elapsed": 0.051210021,
                "rows_read": 64096,
                "bytes_read": 7694802,
                "abr_level": 1
            }
        },
        "statistics": {
            "elapsed": 0.051210021,
            "rows_read": 64096,
            "bytes_read": 7694802,
            "abr_level": 1
        }
    }
}
```

This gives me the time series data for these wall times: P999, P99, P90, and median.

I want a function similar to this in my releaseWorkflow.ts file:

async function getWallTimes(workerName: string, from: number, to: number): Promise<{ p999: number, p99: number, p90: number, median: number }>

You should be able to use the client.workers.observability.telemetry.query method, but if that doesn't work, feel free to use the API directly
