@tool

extends Control


@onready var camera: FreeCamera3D = %FreeCamera3D
var initCameraTransform: Transform3D
var initCameraRotation: Vector3

var fps: int = 0
var fixed_fps: int = 90

# Called when the node enters the scene tree for the first time.
func _ready() -> void:
    initCameraTransform = camera.transform
    initCameraRotation = camera.rotation
    
    %camera_aperture_s.value = %always_uniform_camera.aperture
    %camera_fov_s.value = camera.fov
    %camera_focus_s.value = %always_uniform_camera.focus
    %gamma_s.value = %always_uniform_camera.gamma
    %max_sample_s.value = %PostProcessShader.max_sample
    %light_quality_s.value = %always_uniform_camera.quality
    %fixed_fps_edit.text = str(fixed_fps)

var delta_fps_cache: Array = []
var last_average_fps = 0

func _fixed_fps(delta: float) -> void:
    var delta_fps := fps - fixed_fps
#    print(delta_fps)
#    print(delta_fps_cache)
    if delta_fps_cache.size() >= 100: delta_fps_cache.pop_front()
    delta_fps_cache.append(delta_fps)
    
    var average_fps = 0
    for i in delta_fps_cache:
        average_fps += i
    average_fps /= delta_fps_cache.size()
    
#    print(average_fps)
    var base = %light_quality_s.value
    if average_fps >= 0:    base += 1 + abs(average_fps)
    else:                   base -= 0.001 + abs(average_fps) * 0.001
    
    %light_quality_s.value = base

func _process(delta: float) -> void:
    fps = Performance.get_monitor(Performance.TIME_FPS)
    %fps.text = str(fps)
    %sample.text = str(%PostProcessShader.frame)
    if is_instance_valid(camera):
        %camera_speed.text = str(camera.max_speed)
        %camera_speed_s.value = camera.max_speed
        
    _fixed_fps(delta)


func _on_sampleonceb_pressed() -> void:
    %PostProcessShader.frame = 0


func _on_restcamerab_pressed() -> void:
    camera.transform = initCameraTransform
    camera.reset_rotation(initCameraRotation)
    %PostProcessShader.frame = 0


func _on_camera_speed_s_value_changed(value: float) -> void:
    camera.max_speed = value


func _on_camera_aperture_s_value_changed(value: float) -> void:
    %always_uniform_camera.aperture = value
    %camera_aperture.text = str(value)
    %PostProcessShader.frame = 0


func _on_camera_focus_s_value_changed(value: float) -> void:
    %always_uniform_camera.focus = value
    %camera_focus.text = str(value)
    %PostProcessShader.frame = 0


func _on_camera_fov_s_value_changed(value: float) -> void:
    %always_uniform_camera.vfov = value
    %camera_fov.text = str(value)
    %PostProcessShader.frame = 0


func _on_gamma_s_value_changed(value: float) -> void:
    %always_uniform_camera.gamma = value
    %gamma.text = str(value)
    %PostProcessShader.frame = 0


func _on_max_sample_s_value_changed(value: float) -> void:
    %PostProcessShader.max_sample = int(value)
    %max_sample.text = str(value)


func _on_light_quality_s_value_changed(value: float) -> void:
    %always_uniform_camera.quality = value
    %light_quality.text = str(value)
    # %PostProcessShader.frame = 0

func _on_fixed_fps_edit_text_changed() -> void:
    var text: String = %fixed_fps_edit.text
    var value: int = clampi(abs(int(text)), 1, 360)
    var str_value = str(value)
    if str_value != text:
        %fixed_fps_edit.text = str_value
