CREATE TABLE `site` (
  `site_id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255),
  `location` varchar(255),
  `capacity_kw` decimal,
  `timezone` varchar(255)
);

CREATE TABLE `pv_group` (
  `group_id` int PRIMARY KEY AUTO_INCREMENT,
  `site_id` int,
  `orientation` varchar(255),
  `tilt_angle_deg` decimal,
  `nominal_power_kw` decimal
);

CREATE TABLE `pv_panel` (
  `panel_id` int PRIMARY KEY AUTO_INCREMENT,
  `group_id` int,
  `manufacturer` varchar(255),
  `model` varchar(255),
  `rated_power_w` decimal,
  `voltage_nominal_v` decimal,
  `serial_number` varchar(255)
);

CREATE TABLE `inverter` (
  `inverter_id` int PRIMARY KEY AUTO_INCREMENT,
  `group_id` int,
  `rated_power_kw` decimal,
  `ip_address` varchar(255)
);

CREATE TABLE `sensor` (
  `sensor_id` int PRIMARY KEY AUTO_INCREMENT,
  `group_id` int,
  `type` varchar(255),
  `unit` varchar(255),
  `location` varchar(255)
);

CREATE TABLE `weather_data` (
  `weather_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `site_id` int,
  `timestamp` datetime,
  `irradiance_wm2` decimal,
  `ambient_temp_c` decimal,
  `module_temp_c` decimal,
  `wind_speed_ms` decimal,
  `wind_dir_deg` decimal
);

CREATE TABLE `telemetry` (
  `telemetry_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `device_type` varchar(255),
  `device_id` int,
  `timestamp` datetime,
  `parameter` varchar(255),
  `value` decimal,
  `unit` varchar(255)
);

CREATE TABLE `event_log` (
  `event_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `timestamp` datetime,
  `device_type` varchar(255),
  `device_id` int,
  `severity` varchar(255),
  `message` text,
  `acknowledged` boolean
);

CREATE TABLE `control_command` (
  `command_id` bigint PRIMARY KEY AUTO_INCREMENT,
  `device_id` int,
  `user_id` int,
  `timestamp` datetime,
  `command` varchar(255),
  `status` varchar(255),
  `response_message` text
);

CREATE TABLE `user_account` (
  `user_id` int PRIMARY KEY AUTO_INCREMENT,
  `username` varchar(255),
  `password_hash` varchar(255),
  `role` varchar(255),
  `last_login` datetime
);

CREATE TABLE `device` (
  `device_id` int PRIMARY KEY AUTO_INCREMENT,
  `type` varchar(255),
  `reference_id` int,
  `name` varchar(255),
  `manufacturer` varchar(255),
  `model` varchar(255)
);

CREATE TABLE `user_site` (
  `user_site_id` int PRIMARY KEY AUTO_INCREMENT,
  `user_id` int,
  `site_id` int,
  `access_level` varchar(255)
);

ALTER TABLE `pv_group` ADD FOREIGN KEY (`site_id`) REFERENCES `site` (`site_id`);

ALTER TABLE `pv_panel` ADD FOREIGN KEY (`group_id`) REFERENCES `pv_group` (`group_id`);

ALTER TABLE `inverter` ADD FOREIGN KEY (`group_id`) REFERENCES `pv_group` (`group_id`);

ALTER TABLE `sensor` ADD FOREIGN KEY (`group_id`) REFERENCES `pv_group` (`group_id`);

ALTER TABLE `weather_data` ADD FOREIGN KEY (`site_id`) REFERENCES `site` (`site_id`);

ALTER TABLE `telemetry` ADD FOREIGN KEY (`device_id`) REFERENCES `device` (`device_id`);

ALTER TABLE `event_log` ADD FOREIGN KEY (`device_id`) REFERENCES `device` (`device_id`);

ALTER TABLE `control_command` ADD FOREIGN KEY (`device_id`) REFERENCES `device` (`device_id`);

ALTER TABLE `control_command` ADD FOREIGN KEY (`user_id`) REFERENCES `user_account` (`user_id`);

ALTER TABLE `sensor` ADD FOREIGN KEY (`sensor_id`) REFERENCES `device` (`reference_id`);

ALTER TABLE `inverter` ADD FOREIGN KEY (`inverter_id`) REFERENCES `device` (`reference_id`);
