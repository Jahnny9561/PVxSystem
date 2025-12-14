# Симулация на PV данни
Несложна симулация на PV система, която генерира данни,
за да се провери изправността на информационната система.

Как може да се използва симулацията? Моля, прочетете по-долу за информация.

## Първо трябва да се създаде тест обект в MySQL, от който да се симулира събиране на данни:
```
INSERT INTO site (name, capacity_kw, timezone)
VALUES ('Test Site', 5.00, 'Europe/Sofia');
SELECT * FROM site;
```

## След това се пуска сървъра, ако не е пуснат:
```
npm run dev
```

## Пуска се симулацията:
```
curl -X POST http://localhost:3000/sites/1/simulate/start -H "Content-Type: application/json" -d '{"intervalMs": 3000}'
```
### За Windows да се използва curl.exe

## В MySQL да се използват следните команди, за да се видят натрупаните данни:

### Telemetry:
```
SELECT * 
FROM telemetry
ORDER BY timestamp DESC;
```

### Weather data:
```
SELECT * 
FROM weather_data
ORDER BY timestamp DESC;
```

### Възможно е и с 'curl' да се получат данните:
```
curl http://localhost:3000/sites/1/telemetry?limit=50
```

## Спиране на симулацията:
```
curl -X POST http://localhost:3000/sites/1/simulate/stop
```

## За получаване на данни, които да се използват за диаграмите:
```
curl -X POST http://localhost:3000/sites/1/simulate/seed -H "Content-Type: application/json" -d '{"points": 96}'
```

## Полезни MySQL заявки:

### Брой записи:
```
SELECT COUNT(*) FROM telemetry;
```

### Power curve over time:
```
SELECT timestamp, value
FROM telemetry
WHERE parameter = 'Power'
ORDER BY timestamp;
```

### Daily energy estimate (kWh)
```
SELECT 
  DATE(timestamp) AS day,
  SUM(value) * (5.0 / 3600) AS estimated_kwh
FROM telemetry
GROUP BY DATE(timestamp);
```
