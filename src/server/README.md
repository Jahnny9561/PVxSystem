# Симулация на PV данни
Как да използваме симулацията? Прочетете текста по-долу за отговор на този въпрос.

## Първо създаваме един тест обект в MySQL, от който да симулираме събиране на данни:
```
INSERT INTO site (name, capacity_kw, timezone)
VALUES ('Test Site', 5.00, 'Europe/Sofia');
SELECT * FROM site;
```

## След това пускаме сървъра, ако не е пуснат:
```
npm run dev
```

## Пускаме симулацията:
```
curl -X POST http://localhost:3000/sites/1/simulate/start -H "Content-Type: application/json" -d '{"intervalMs": 3000}'
```
### За Windows да се използва curl.exe

## В MySQL използвайте командата, за да видите натрупаните данни:
```
SELECT * 
FROM telemetry
ORDER BY timestamp DESC;

SELECT * 
FROM weather_data
ORDER BY timestamp DESC;
```

### Може и с curl да получим данните:
```
curl http://localhost:3000/sites/1/telemetry?limit=50
```

## Спиране на симулацията:
```
curl -X POST http://localhost:3000/sites/1/simulate/stop
```

## За получаване на данните, които да се използват за диаграмите:
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
